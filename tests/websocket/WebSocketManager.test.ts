/**
 * Path: /tests/exchanges/binance/BinanceConnector.test.ts
 * 바이낸스 커넥터 테스트
 * - WebSocket 연결 및 구독/구독해지 테스트
 * - Book Ticker 데이터 수신 및 Redis 저장 테스트
 * - 재연결 및 상태 관리 테스트
 */

import { MockWebSocketManager } from "../mock/MockWebSocketManager";
import { BinanceConnector } from "../../src/exchanges/binance/BinanceConnector";
import { BookTickerData } from "../../src/exchanges/common/types";
import { RedisBookTickerStorage } from "../../src/storage/redis/RedisClient";
import { BookTickerStorage } from "../../src/exchanges/common/BookTickerStorage";
import { ConnectorState } from "../../src/states/types";
import {
    WebSocketError,
    ErrorCode,
    ErrorSeverity,
} from "../../src/errors/types";
import { IWebSocketManager } from "../../src/websocket/IWebSocketManager";
import { WebSocketManager } from "../../src/websocket/WebSocketManager";
import { MockWebSocketClient } from "./MockWebSocketClient";
import { WebSocketConfig } from "../../src/websocket/types";
import { MockErrorHandler } from "./MockErrorHandler";

describe("바이낸스 커넥터 테스트", () => {
    let connector: BinanceConnector;
    let wsManager: IWebSocketManager;
    let redisStorage: RedisBookTickerStorage;
    const testSymbols = ["BTCUSDT", "ETHUSDT"];

    beforeAll(async () => {
        // Redis 스토리지 초기화
        redisStorage = new RedisBookTickerStorage({
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
        });
        await BookTickerStorage.initialize(redisStorage);
    });

    beforeEach(() => {
        const mockClient = new MockWebSocketClient();
        const mockErrorHandler = new MockErrorHandler();
        const wsConfig: WebSocketConfig = {
            url: "wss://stream.binance.com:9443/ws",
            options: {
                pingInterval: 30000,
                pongTimeout: 5000,
                headers: {},
                timeout: 60000,
            },
            reconnectOptions: {
                maxAttempts: 5,
                delay: 1000,
                maxDelay: 10000,
            },
        };

        wsManager = new WebSocketManager(
            mockClient,
            wsConfig,
            mockErrorHandler,
            "test_ws"
        );

        connector = new BinanceConnector(
            "test-binance",
            testSymbols,
            wsManager
        );
    });

    afterEach(async () => {
        await connector.stop();
        // Redis 데이터 정리
        for (const symbol of testSymbols) {
            await redisStorage.client.del(`bookTicker:binance:${symbol}`);
        }
    });

    afterAll(async () => {
        await redisStorage.cleanup();
    });

    test("커넥터 시작 시 WebSocket 연결 및 심볼 구독이 정상적으로 완료되어야 함", async () => {
        const stateChangePromise = new Promise<void>((resolve) => {
            connector.on("stateChange", (event) => {
                if (event.currentState === ConnectorState.SUBSCRIBED) {
                    resolve();
                }
            });
        });

        await connector.start();

        // WebSocket 연결 성공 확인
        expect(wsManager.getState()).toBe(ConnectorState.CONNECTED);
        await expect(stateChangePromise).resolves.toBeUndefined();
    }, 10000);

    test("Book Ticker 데이터를 수신하고 Redis에 정상적으로 저장되어야 함", async () => {
        const mockBookTickerData = {
            u: 400900217,
            s: "BTCUSDT",
            b: "25.35190000",
            B: "31.21000000",
            a: "25.36520000",
            A: "40.66000000",
        };

        await connector.start();

        // Book Ticker 데이터 수신 모니터링
        const messagePromise = new Promise<BookTickerData>((resolve) => {
            connector.onBookTickerUpdate((data) => {
                resolve(data);
            });
        });

        // 모의 메시지 전송
        wsManager.simulateMessage(mockBookTickerData);

        // 수신된 데이터 검증
        const receivedData = await messagePromise;
        expect(receivedData).toHaveProperty("symbol", "BTCUSDT");
        expect(receivedData).toHaveProperty("exchange", "binance");
        expect(receivedData.bids[0][0]).toBe(25.3519);
        expect(receivedData.bids[0][1]).toBe(31.21);
        expect(receivedData.asks[0][0]).toBe(25.3652);
        expect(receivedData.asks[0][1]).toBe(40.66);

        // Redis 저장 확인
        const storedData = await BookTickerStorage.getInstance().getBookTicker(
            "binance",
            "BTCUSDT"
        );
        expect(storedData).toBeTruthy();
        expect(storedData?.symbol).toBe("BTCUSDT");
        expect(storedData?.bids[0]).toEqual(receivedData.bids[0]);
        expect(storedData?.asks[0]).toEqual(receivedData.asks[0]);
    }, 15000);

    test("연결 해제 시 상태가 정상적으로 변경되어야 함", async () => {
        await connector.start();
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED);

        const disconnectPromise = new Promise<void>((resolve) => {
            connector.on("stateChange", (event) => {
                if (event.currentState === ConnectorState.DISCONNECTED) {
                    resolve();
                }
            });
        });

        await connector.stop();
        await expect(disconnectPromise).resolves.toBeUndefined();
        expect(connector.getState()).toBe(ConnectorState.DISCONNECTED);
    }, 10000);

    test("연결 끊김 시 자동 재연결이 동작해야 함", async () => {
        await connector.start();
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED);

        const reconnectPromise = new Promise<void>((resolve) => {
            connector.on("stateChange", (event) => {
                if (event.currentState === ConnectorState.SUBSCRIBED) {
                    resolve();
                }
            });
        });

        // 연결 끊김 시뮬레이션
        wsManager.simulateConnectionClose();

        await expect(reconnectPromise).resolves.toBeUndefined();
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED);
    }, 20000);

    test("에러 발생 시 적절한 에러 처리가 수행되어야 함", async () => {
        await connector.start();

        const errorPromise = new Promise<WebSocketError>((resolve) => {
            connector.on("error", (error) => {
                resolve(error);
            });
        });

        const mockError = new WebSocketError(
            ErrorCode.MESSAGE_PARSE_ERROR,
            "Test error",
            new Error("Test error details"),
            ErrorSeverity.MEDIUM
        );

        wsManager.simulateError(mockError);

        const receivedError = await errorPromise;
        expect(receivedError.code).toBe(ErrorCode.MESSAGE_PARSE_ERROR);
        expect(receivedError.severity).toBe(ErrorSeverity.MEDIUM);
    }, 10000);
});
