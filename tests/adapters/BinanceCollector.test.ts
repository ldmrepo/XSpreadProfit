/**
 * src/tests/adapters/BinanceCollector.test.ts
 *
 * BinanceAdapter와 Collector 통합 테스트
 * - 데이터 수집 기능
 * - 연결 관리
 * - 에러 처리
 * - 재연결 메커니즘
 */

import Collector from "../../src/components/Collector";
import { BinanceAdapter } from "../../src/adapters/binance/BinanceAdapter";
import { BinanceSpotDepthStream } from "../mock/binance/mock-binance-spot-socket-server";
import { MockBinanceSpotApiServer } from "../mock/binance/mock-binance-spot-api-server";
import EventManager from "../../src/managers/ErrorManager";

import StateManager from "../../src/managers/StateManager";
import MetricManager from "../../src/managers/MetricManager";
import ErrorManager from "../../src/managers/ErrorManager";
import { Logger } from "../../src/utils/logger";
import { Server } from "http";

jest.mock("../../src/utils/logger");
jest.mock("../../src/managers/EventManager");
jest.mock("../../src/managers/StateManager");
jest.mock("../../src/managers/MetricManager");
jest.mock("../../src/managers/ErrorManager");

describe("바이낸스 수집기 통합 테스트", () => {
    let collector: Collector;
    let adapter: BinanceAdapter;
    let spotWsServer: BinanceSpotDepthStream | null = null;
    let spotRestServer: Server | null = null;
    let eventManager: jest.Mocked<EventManager>;
    let stateManager: jest.Mocked<StateManager>;
    let metricManager: jest.Mocked<MetricManager>;
    let errorManager: jest.Mocked<ErrorManager>;
    let ports: { SPOT_WS: number; SPOT_REST: number };

    const getRandomPort = () =>
        Math.floor(Math.random() * (65535 - 10000) + 10000);

    beforeEach(async () => {
        // 포트 할당
        ports = {
            SPOT_WS: getRandomPort(),
            SPOT_REST: getRandomPort(),
        };

        // Mock 서버 시작
        spotWsServer = new BinanceSpotDepthStream(ports.SPOT_WS);
        const spotServer = new MockBinanceSpotApiServer(ports.SPOT_REST);

        // 매니저 초기화
        eventManager = new EventManager() as jest.Mocked<EventManager>;
        stateManager = new StateManager() as jest.Mocked<StateManager>;
        metricManager = new MetricManager() as jest.Mocked<MetricManager>;
        errorManager = new ErrorManager() as jest.Mocked<ErrorManager>;

        // Adapter 및 Collector 초기화
        adapter = new BinanceAdapter();
        collector = new Collector({
            id: "BINANCE_COLLECTOR",
            exchangeId: "BINANCE",
            websocketUrl: `ws://localhost:${ports.SPOT_WS}`,
            managers: {
                eventManager,
                stateManager,
                metricManager,
                errorManager,
            },
            wsConfig: {
                reconnectInterval: 1000,
                maxReconnectAttempts: 3,
            },
            bufferConfig: {
                maxSize: 1000,
                flushInterval: 100,
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    afterEach(async () => {
        await collector.stop();

        if (spotWsServer) {
            await new Promise<void>((resolve) =>
                spotWsServer!.close(() => resolve())
            );
            spotWsServer = null;
        }

        if (spotRestServer) {
            await new Promise<void>((resolve) =>
                spotRestServer!.close(() => resolve())
            );
            spotRestServer = null;
        }

        jest.clearAllMocks();
    });

    describe("수집기 기본 기능", () => {
        it("수집기가 정상적으로 시작되어야 한다", async () => {
            await collector.start();
            expect(stateManager.changeState).toHaveBeenCalledWith(
                "BINANCE_COLLECTOR",
                "RUNNING"
            );
        });

        it("심볼 구독에 성공해야 한다", async () => {
            await collector.start();
            await collector.subscribe(["BTC-USDT", "ETH-USDT"]);

            const subscriptions = collector.getSubscriptions();
            expect(subscriptions).toContain("BTC-USDT");
            expect(subscriptions).toContain("ETH-USDT");
        });

        it("구독 해제가 정상적으로 동작해야 한다", async () => {
            await collector.start();
            await collector.subscribe(["BTC-USDT", "ETH-USDT"]);
            await collector.unsubscribe(["BTC-USDT"]);

            const subscriptions = collector.getSubscriptions();
            expect(subscriptions).not.toContain("BTC-USDT");
            expect(subscriptions).toContain("ETH-USDT");
        });
    });

    describe("데이터 수집 및 처리", () => {
        it("수신된 데이터를 정상적으로 이벤트로 발행해야 한다", (done) => {
            eventManager.publish.mockImplementation((event) => {
                try {
                    expect(event).toHaveProperty("type", "MARKET_DATA");
                    expect(event.payload).toHaveProperty("symbol");
                    expect(event.payload).toHaveProperty("data");
                    done();
                    return Promise.resolve();
                } catch (error) {
                    done(error);
                    return Promise.reject(error);
                }
            });

            collector.start().then(() => {
                collector.subscribe(["BTC-USDT"]);
            });
        });

        it("대량의 데이터를 버퍼링하여 처리해야 한다", async () => {
            await collector.start();
            await collector.subscribe(["BTC-USDT", "ETH-USDT"]);

            // 데이터 수신 대기
            await new Promise((resolve) => setTimeout(resolve, 2000));

            expect(eventManager.publish).toHaveBeenCalled();
            expect(metricManager.collect).toHaveBeenCalled();
        });
    });

    describe("에러 처리 및 복구", () => {
        it("연결 끊김 시 자동으로 재연결을 시도해야 한다", async () => {
            await collector.start();

            // WebSocket 서버 재시작
            spotWsServer!.close();
            await new Promise((resolve) => setTimeout(resolve, 100));
            spotWsServer = new BinanceSpotDepthStream(ports.SPOT_WS);

            // 재연결 대기
            await new Promise((resolve) => setTimeout(resolve, 2000));

            expect(collector.isConnected()).toBe(true);
        });

        it("구독 중이던 심볼을 재연결 후 자동으로 재구독해야 한다", async () => {
            await collector.start();
            await collector.subscribe(["BTC-USDT"]);

            // WebSocket 서버 재시작
            spotWsServer!.close();
            await new Promise((resolve) => setTimeout(resolve, 100));
            spotWsServer = new BinanceSpotDepthStream(ports.SPOT_WS);

            // 재연결 및 재구독 대기
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const subscriptions = collector.getSubscriptions();
            expect(subscriptions).toContain("BTC-USDT");
        });

        it("최대 재시도 횟수 초과 시 에러를 발생시켜야 한다", async () => {
            await collector.start();

            // WebSocket 서버 종료
            spotWsServer!.close();
            spotWsServer = null;

            // 최대 재시도 시간 대기
            await new Promise((resolve) => setTimeout(resolve, 5000));

            expect(errorManager.handleError).toHaveBeenCalled();
            expect(stateManager.changeState).toHaveBeenCalledWith(
                "BINANCE_COLLECTOR",
                "ERROR"
            );
        });
    });

    describe("메트릭 수집", () => {
        it("연결 상태 메트릭을 수집해야 한다", async () => {
            await collector.start();
            expect(metricManager.collect).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GAUGE",
                    name: expect.stringContaining("connection_status"),
                })
            );
        });

        it("처리된 메시지 수를 수집해야 한다", async () => {
            await collector.start();
            await collector.subscribe(["BTC-USDT"]);

            // 데이터 수신 대기
            await new Promise((resolve) => setTimeout(resolve, 2000));

            expect(metricManager.collect).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "COUNTER",
                    name: expect.stringContaining("processed_messages"),
                })
            );
        });
    });
});
