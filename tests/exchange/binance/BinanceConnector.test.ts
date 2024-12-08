/**
 * Path: /tests/exchanges/binance/BinanceConnector.test.ts
 * 바이낸스 커넥터 테스트
 */
import { BinanceConnector } from "../../../src/exchanges/binance/BinanceConnector";
import { RedisBookTickerStorage } from "../../../src/storage/redis/RedisClient";
import {
    ConnectorState,
    StateTransitionEvent,
} from "../../../src/states/types";
import {
    WebSocketConfig,
    WebSocketMessage,
} from "../../../src/websocket/types";
import { ErrorHandler } from "../../../src/errors/ErrorHandler";
import { IWebSocketManager } from "../../../src/websocket/IWebSocketManager";
import {
    MockWebSocketManager,
    MockWebSocketClient,
} from "../../mock/MockWebSocketManager";
import { BookTickerData } from "../../../src/exchanges/common/types";
import Redis from "ioredis";
import { BookTickerStorage } from "../../../src/exchanges/common/BookTickerStorage";
import path from "path";
import fs from "fs";
import EventEmitter from "events";

describe("바이낸스 커넥터 테스트", () => {
    let connector: BinanceConnector;
    let wsManager: IWebSocketManager;
    let mockWsClient: MockWebSocketClient;
    let mockRedisStorage: RedisBookTickerStorage;
    let errorHandler: ErrorHandler;
    let testSymbols = ["BTCUSDT", "ETHUSDT"];

    // beforeAll과 afterAll 추가
    beforeAll(() => {
        jest.setTimeout(10000); // 타임아웃 설정

        // 심볼 데이터를 파일에서 읽음
        const filePath = path.join(__dirname, "testSymbols.json");
        testSymbols = JSON.parse(fs.readFileSync(filePath, "utf8"));
    });

    afterAll(async () => {
        await connector?.stop();
    });
    beforeEach(async () => {
        // Redis Storage Mock 생성
        mockRedisStorage = {
            client: {} as unknown as Redis, // Redis 클라이언트 mock
            saveBookTicker: jest.fn().mockResolvedValue(undefined),
            getBookTicker: jest.fn().mockResolvedValue(null),
            getLatestBookTickers: jest.fn().mockResolvedValue([]),
            cleanup: jest.fn().mockResolvedValue(undefined),
            EXPIRY_TIME: 3600,
            KEY_PREFIX: "bookTicker:",
            getKey: jest.fn((exchange: string, symbol: string) => {
                return `bookTicker:${exchange}:${symbol}`;
            }),
        } as unknown as jest.Mocked<RedisBookTickerStorage>;

        // BookTickerStorage 초기화
        //BookTickerStorage.initialize(mockRedisStorage);

        const redisStorage = new RedisBookTickerStorage({
            host: "localhost", // Redis 서버 호스트
            port: 6379, // Redis 서버 포트
            password: "redispass", // 필요한 경우
            db: 0, // 테스트용 DB 번호
        });

        // BookTickerStorage 초기화
        BookTickerStorage.initialize(redisStorage);

        // Mock 클라이언트 및 설정 초기화
        mockWsClient = new MockWebSocketClient();
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

        errorHandler = new ErrorHandler(
            async () => {
                /* 치명적 에러 처리 */
            },
            (error) => {
                /* 일반 에러 처리 */
            }
        );

        wsManager = new MockWebSocketManager(
            "test_ws_manager",
            wsConfig,
            errorHandler
        );

        connector = new BinanceConnector(
            "test-binance",
            testSymbols,
            wsManager
        );
        connector.setMaxListeners(testSymbols.length + 10); // 여유있게 설정

        // 커넥터 시작을 기다림
        await connector.start();

        // 구독 상태가 될 때까지 대기
        await new Promise<void>((resolve) => {
            const checkState = () => {
                if (connector.getState() === ConnectorState.SUBSCRIBED) {
                    resolve();
                } else {
                    setTimeout(checkState, 100);
                }
            };
            checkState();
        });
    });

    afterEach(async () => {
        // 모든 비동기 작업이 완료될 때까지 대기
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (connector) {
            await connector.stop();
        }
    });

    test("WebSocket 연결 및 심볼 구독이 정상적으로 완료되어야 함", async () => {
        // ExchangeConnector가 자동으로 subscribe를 호출할 것이므로
        // 구독 응답만 시뮬레이션하면 됨
        wsManager.simulateMessage({
            result: null,
            id: 1,
        });

        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED);
    });
    test("구독 후 Book Ticker 데이터를 정상적으로 수신해야 함", async () => {
        // 데이터 수신을 위한 Promise
        const messagePromise = new Promise<BookTickerData>((resolve) => {
            connector.on("message", (message) => {
                console.log("Received message:", message);
                resolve(message.data);
            });
        });

        // Book Ticker 메시지 시뮬레이션
        const mockData = {
            u: 400900217,
            s: "BTCUSDT",
            b: "42000.50",
            B: "1.23",
            a: "42001.00",
            A: "0.98",
        };

        wsManager.simulateMessage(mockData);

        // 수신된 데이터 검증
        const receivedData = await messagePromise;
        expect(receivedData.symbol).toBe("BTCUSDT");
        expect(receivedData.exchange).toBe("binance");
        expect(receivedData.timestamp).toBeGreaterThan(0);
        expect(receivedData.bids).toHaveLength(1);
        expect(receivedData.asks).toHaveLength(1);
        expect(receivedData.bids[0]).toEqual([42000.5, 1.23]);
        expect(receivedData.asks[0]).toEqual([42001.0, 0.98]);
    });
    test("Book Ticker 메시지가 정상적으로 처리되어야 함", async () => {
        const messagePromise = new Promise<WebSocketMessage<BookTickerData>>(
            (resolve) => {
                connector.on("message", (message) => resolve(message));
            }
        );

        const initialMessageCount = connector.getMetrics().messageCount;

        // Book Ticker 메시지 시뮬레이션
        const mockData = {
            u: 400900217,
            s: "BTCUSDT",
            b: "42000.50",
            B: "1.23",
            a: "42001.00",
            A: "0.98",
        };

        wsManager.simulateMessage(mockData);

        const receivedMessage = await messagePromise;

        expect(receivedMessage.type).toBe("bookTicker");
        expect(receivedMessage.symbol).toBe("BTCUSDT");
        expect(connector.getMetrics().messageCount).toBe(
            initialMessageCount + 1
        );
    });
    test("Book Ticker 메시지가 정상적으로 처리되어야 함", async () => {
        const messagePromises = testSymbols.map((symbol) => {
            return new Promise<WebSocketMessage<BookTickerData>>((resolve) => {
                const messageHandler = (
                    message: WebSocketMessage<BookTickerData>
                ) => {
                    if (message.symbol === symbol) {
                        // 메시지를 받은 후 리스너 제거
                        connector.removeListener("message", messageHandler);
                        resolve(message);
                    }
                };
                connector.on("message", messageHandler);
            });
        });

        const initialMessageCount = connector.getMetrics().messageCount;

        // Book Ticker 메시지 시뮬레이션
        testSymbols.forEach((symbol) => {
            const mockData = {
                u: 400900217,
                s: symbol,
                b: "42000.50",
                B: "1.23",
                a: "42001.00",
                A: "0.98",
            };
            wsManager.simulateMessage(mockData);
        });

        const receivedMessages = await Promise.all(messagePromises);

        receivedMessages.forEach((receivedMessage, index) => {
            const symbol = testSymbols[index];
            expect(receivedMessage.type).toBe("bookTicker");
            expect(receivedMessage.symbol).toBe(symbol);
        });

        expect(connector.getMetrics().messageCount).toBe(
            initialMessageCount + testSymbols.length
        );
    });
});
