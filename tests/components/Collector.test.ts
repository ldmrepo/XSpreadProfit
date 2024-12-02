import sinon from "sinon";
import WebSocket from "ws";
import EventManager from "../../src/managers/EventManager";
import StateManager from "../../src/managers/StateManager";
import MetricManager from "../../src/managers/MetricManager";
import ErrorManager from "../../src/managers/ErrorManager";
import Collector from "../../src/components/Collector";
import { SharedBuffer } from "../../src/utils/SharedBuffer";
import { MetricType } from "../../src/types/metrics";

jest.mock("ws");
jest.mock("../../src/utils/SharedBuffer");

describe("Collector", () => {
    let collector: Collector;
    let mockWs: any;
    let mockEventManager: any;
    let mockStateManager: any;
    let mockMetricManager: any;
    let mockErrorManager: any;
    let mockSharedBuffer: any;

    beforeEach(() => {
        mockWs = {
            on: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN,
        };

        (WebSocket as jest.Mock).mockImplementation(() => mockWs);

        mockEventManager = {
            publish: jest.fn().mockResolvedValue(undefined),
        };

        mockStateManager = {
            changeState: jest.fn().mockResolvedValue(undefined),
        };

        mockMetricManager = {
            collect: jest.fn().mockResolvedValue(undefined),
        };

        mockErrorManager = {
            handleError: jest.fn().mockResolvedValue(undefined),
        };

        mockSharedBuffer = {
            push: jest.fn().mockResolvedValue(true),
            flush: jest.fn().mockResolvedValue(undefined),
            dispose: jest.fn(),
        };

        (SharedBuffer as jest.Mock).mockImplementation(() => mockSharedBuffer);

        collector = new Collector({
            id: "test-collector",
            exchangeId: "test-exchange",
            websocketUrl: "ws://test.example.com",
            managers: {
                eventManager: mockEventManager,
                stateManager: mockStateManager,
                metricManager: mockMetricManager,
                errorManager: mockErrorManager,
            },
            retryPolicy: {
                maxRetries: 3,
                retryInterval: 1000,
                backoffRate: 2,
            },
        });
    });

    describe("start()", () => {
        it("should initialize WebSocket connection and change state", async () => {
            const connectHandler = jest.fn();
            mockWs.on.mockImplementation((event, handler) => {
                if (event === "open") {
                    connectHandler();
                    handler();
                }
            });

            await collector.start();

            expect(connectHandler).toHaveBeenCalled();
            expect(mockStateManager.changeState).toHaveBeenNthCalledWith(
                1,
                "test-collector",
                "STARTING"
            );
            expect(mockStateManager.changeState).toHaveBeenNthCalledWith(
                2,
                "test-collector",
                "RUNNING"
            );
        });

        it("should handle startup errors properly", async () => {
            const error = new Error("Connection failed");
            mockWs.on.mockImplementation((event, handler) => {
                if (event === "error") handler(error);
            });

            await expect(collector.start()).rejects.toThrow(
                "Connection failed"
            );
            expect(mockErrorManager.handleError).toHaveBeenCalled();
        });
    });

    describe("handleMessage()", () => {
        beforeEach(async () => {
            await collector.subscribe(["BTC-USDT"]);
        });

        it("should process valid market data", async () => {
            const marketData = {
                symbol: "BTC-USDT",
                timestamp: Date.now(),
                data: {
                    price: 50000,
                    quantity: 1,
                    side: "BUY",
                },
            };

            await (collector as any).handleMessage(JSON.stringify(marketData));

            expect(mockSharedBuffer.push).toHaveBeenCalled();
            expect(mockMetricManager.collect).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: MetricType.COUNTER,
                    module: "test-collector",
                    name: "processed_messages",
                })
            );
        });

        it("should handle invalid data", async () => {
            const invalidData = { invalid: "data" };
            await (collector as any).handleMessage(JSON.stringify(invalidData));

            expect(mockErrorManager.handleError).toHaveBeenCalled();
            expect(mockSharedBuffer.push).not.toHaveBeenCalled();
        });
    });

    describe("connection management", () => {
        it("should attempt reconnection on connection close", async () => {
            let closeHandler: Function;
            mockWs.on.mockImplementation((event, handler) => {
                if (event === "close") closeHandler = handler;
            });

            await collector.start();
            closeHandler();

            expect(WebSocket).toHaveBeenCalledTimes(2);
        });

        it("should handle connection errors", async () => {
            const error = new Error("Network error");
            mockWs.on.mockImplementation((event, handler) => {
                if (event === "error") handler(error);
            });

            await expect(collector.start()).rejects.toThrow();
            expect(mockErrorManager.handleError).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "NETWORK",
                    type: "RECOVERABLE",
                })
            );
        });
    });
});
