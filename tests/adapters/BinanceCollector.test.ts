/**
 * src/tests/adapters/BinanceCollector.test.ts
 */

import Collector from "../../src/components/Collector";
import { BinanceAdapter } from "../../src/adapters/binance/BinanceAdapter";
import { BinanceSpotDepthStream } from "../mock/binance/mock-binance-spot-socket-server";
import { MockBinanceSpotApiServer } from "../mock/binance/mock-binance-spot-api-server";
import {
    EventManager,
    StateManager,
    MetricManager,
    ErrorManager,
} from "../../src/managers";
import { Logger } from "../../src/utils/logger";
import { RetryPolicy } from "../../src/types/config";
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
    let eventManager: EventManager;
    let stateManager: StateManager;
    let metricManager: MetricManager;
    let errorManager: ErrorManager;
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
        const spotServer = new MockBinanceSpotApiServer();
        spotRestServer = spotServer.listen(ports.SPOT_REST);

        // 매니저 초기화
        eventManager = EventManager.getInstance();
        stateManager = StateManager.getInstance();
        metricManager = MetricManager.getInstance();
        errorManager = ErrorManager.getInstance();

        // Jest mock 메서드 설정
        (eventManager.publish as jest.Mock) = jest.fn();
        (stateManager.changeState as jest.Mock) = jest.fn();
        (metricManager.collect as jest.Mock) = jest.fn();
        (errorManager.handleError as jest.Mock) = jest.fn();

        // Adapter 및 Collector 초기화
        adapter = new BinanceAdapter();
        collector = new Collector(
            adapter,
            {
                id: "BINANCE_COLLECTOR",
                exchangeId: "BINANCE",
                websocketUrl: `ws://localhost:${ports.SPOT_WS}`,
                wsConfig: {
                    url: `ws://localhost:${ports.SPOT_WS}`,
                    maxReconnectAttempts: 5,
                    reconnectInterval: 1000,
                    options: {
                        handshakeTimeout: 5000,
                        pingInterval: 10000,
                        pingTimeout: 5000,
                    },
                    pingInterval: 10000,
                    pongTimeout: 5000,
                },
                bufferConfig: {
                    maxSize: 1000,
                    flushInterval: 100,
                    flushThreshold: 500,
                },
                retryPolicy: {
                    maxRetries: 3,
                    retryInterval: 1000,
                    backoffRate: 1,
                },
            },
            {
                eventManager,
                stateManager,
                metricManager,
                errorManager,
            }
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    afterEach(async () => {
        await collector.stop();

        if (spotWsServer) {
            await new Promise<void>((resolve) => spotWsServer!.close());
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

    // ... (나머지 테스트 코드는 동일)
});
