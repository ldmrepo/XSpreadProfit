/**
 * src/tests/adapters/BinanceAdapter.test.ts
 */

import { BinanceAdapter } from "../../src/adapters/binance/BinanceAdapter";
import { BinanceSpotDepthStream } from "../mock/binance/mock-binance-spot-socket-server";
import { BinanceFuturesDepthStream } from "../mock/binance/mock-binance-futures-socket-server";
import { MockBinanceSpotApiServer } from "../mock/binance/mock-binance-spot-api-server";
import { MockBinanceFuturesApiServer } from "../mock/binance/mock-binance-futures-api-server";
import { Logger } from "../../src/utils/logger";
import WebSocket from "ws";
import axios from "axios";
import { AddressInfo, Server } from "net";

// Logger 모킹
jest.mock("../../src/utils/logger");

// 테스트 타임아웃 설정
jest.setTimeout(30000);

describe("바이낸스 어댑터 (BinanceAdapter)", () => {
    let adapter: BinanceAdapter;
    let mockSpotWsServer: BinanceSpotDepthStream;
    let mockSpotRestServer: MockBinanceSpotApiServer;
    let mockFuturesWsServer: BinanceFuturesDepthStream;
    let mockFuturesRestServer: MockBinanceFuturesApiServer;
    let ports: {
        SPOT_WS: number;
        SPOT_REST: number;
        FUTURES_WS: number;
        FUTURES_REST: number;
    };

    const getRandomPort = () =>
        Math.floor(Math.random() * (65535 - 10000) + 10000);

    beforeAll(() => {
        // Logger 모킹 설정
        (Logger.prototype.info as jest.Mock) = jest.fn();
        (Logger.prototype.error as jest.Mock) = jest.fn();
        (Logger.prototype.warn as jest.Mock) = jest.fn();
    });

    beforeEach(async () => {
        // 랜덤 포트 할당
        ports = {
            SPOT_WS: getRandomPort(),
            SPOT_REST: getRandomPort(),
            FUTURES_WS: getRandomPort(),
            FUTURES_REST: getRandomPort(),
        };

        try {
            // Mock 서버 시작
            mockSpotWsServer = new BinanceSpotDepthStream(ports.SPOT_WS);
            mockSpotRestServer = new MockBinanceSpotApiServer(ports.SPOT_REST);
            mockFuturesWsServer = new BinanceFuturesDepthStream(
                ports.FUTURES_WS
            );
            mockFuturesRestServer = new MockBinanceFuturesApiServer(
                ports.FUTURES_REST
            );

            adapter = new BinanceAdapter();

            // 서버 시작 대기
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
            console.error("Server setup failed:", error);
            throw error;
        }
    });

    afterEach(async () => {
        try {
            // 서버 종료 시 타임아웃 설정
            const closeWithTimeout = async (
                server: any,
                timeout: number = 5000
            ) => {
                return Promise.race([
                    server.close(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error("Server close timeout")),
                            timeout
                        )
                    ),
                ]);
            };

            await Promise.all([
                closeWithTimeout(mockSpotRestServer),
                closeWithTimeout(mockFuturesRestServer),
                mockSpotWsServer.close(),
                mockFuturesWsServer.close(),
            ]).catch((error) => {
                console.error("Server cleanup failed:", error);
            });

            // 포트 해제 대기
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } finally {
            jest.clearAllMocks();
        }
    });

    afterAll(() => {
        jest.resetAllMocks();
    });

    // 심볼 변환 테스트는 서버와 무관하므로 별도로 실행
    describe("심볼 변환", () => {
        it("거래소 형식으로 심볼을 변환해야 한다", () => {
            const adapter = new BinanceAdapter();
            expect(adapter.normalizeSymbol("BTC-USDT")).toBe("BTCUSDT");
            expect(adapter.normalizeSymbol("ETH-USDT")).toBe("ETHUSDT");
        });

        it("내부 형식으로 심볼을 변환해야 한다", () => {
            const adapter = new BinanceAdapter();
            expect(adapter.denormalizeSymbol("BTCUSDT")).toBe("BTC-USDT");
            expect(adapter.denormalizeSymbol("ETHUSDT")).toBe("ETH-USDT");
        });
    });

    // ... (나머지 테스트 코드는 동일)

    // REST API 테스트에 재시도 로직 추가
    describe("REST API 통합", () => {
        const axiosWithRetry = async (config: any, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    return await axios(config);
                } catch (error) {
                    if (i === retries - 1) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        };

        it("현물 호가창 데이터를 정상적으로 조회해야 한다", async () => {
            const response: any = await axiosWithRetry({
                method: "get",
                url: "/api/v3/depth",
                baseURL: `http://localhost:${ports.SPOT_REST}`,
                params: {
                    symbol: "BTCUSDT",
                    limit: 100,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty("lastUpdateId");
            expect(response.data.bids).toBeInstanceOf(Array);
            expect(response.data.asks).toBeInstanceOf(Array);
        });

        // ... (나머지 REST API 테스트도 axiosWithRetry 사용)
    });
});
