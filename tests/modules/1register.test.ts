/**
 * test/modules/register/register.test.ts
 */

import { Register } from "../../src/modules/register";
import { StandardData } from "../../src/types/market";
import Redis from "ioredis";

jest.mock("ioredis", () => {
    return jest.fn().mockImplementation(() => {
        const storedData: string[] = [];
        const eventHandlers: { [key: string]: Function[] } = {
            error: [],
            ready: [],
        };

        const mockMulti = {
            commands: [] as any[],
            rpush: function (key: string, value: string) {
                this.commands.push({ key, value });
                return this;
            },
            exec: async function () {
                const results = this.commands.map((cmd) => {
                    storedData.push(cmd.value);
                    return [null, "OK"];
                });
                this.commands = [];
                return results;
            },
        };

        return {
            multi: () => mockMulti,
            ping: async () => "PONG",
            quit: jest.fn().mockResolvedValue(undefined),
            on: (event: string, handler: Function) => {
                if (!eventHandlers[event]) {
                    eventHandlers[event] = [];
                }
                eventHandlers[event].push(handler);
            },
            emit: (event: string, ...args: any[]) => {
                if (eventHandlers[event]) {
                    eventHandlers[event].forEach((handler) => handler(...args));
                }
            },
            lrange: async () => storedData,
            getStoredData: () => storedData,
        };
    });
});

describe("Register (등록기)", () => {
    let register: Register;
    let mockRedis: any;

    const config = {
        redisUrl: "redis://localhost:6379",
        auth: "redispass",
        batchSize: 5,
        batchInterval: 1000,
        maxRetries: 3,
        maxBufferSize: 10,
        maxDataAge: 5000,
        healthCheckInterval: 1000,
        enableHealthCheck: false, // 테스트에서는 healthCheck 비활성화
    };

    beforeEach(() => {
        jest.useFakeTimers();
        register = new Register(config);
        mockRedis = (Redis as unknown as jest.Mock).mock.results[0].value;
    });

    afterEach(async () => {
        await register.shutdown();
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    const createOrderBookData = (symbol: string): StandardData => ({
        exchange: "binance",
        symbol,
        ticker: `${symbol}USDT`,
        exchangeType: "spot" as const,
        timestamp: Date.now(),
        bids: [[10000, 1]],
        asks: [[10010, 1]],
    });

    describe("기본 기능", () => {
        it("배치 크기만큼 데이터가 쌓이면 즉시 처리해야 한다", async () => {
            const processPromise = new Promise<void>((resolve) => {
                register.once("batchProcessed", () => resolve());
            });

            for (let i = 0; i < config.batchSize; i++) {
                register.process(createOrderBookData("BTC"));
            }

            await processPromise;
            expect((register as any).buffer.length).toBe(0);
        });

        it("배치 간격이 지나면 데이터를 처리해야 한다", async () => {
            const processPromise = new Promise<void>((resolve) => {
                register.once("batchProcessed", () => resolve());
            });

            register.process(createOrderBookData("ETH"));

            jest.advanceTimersByTime(config.batchInterval + 100);
            await processPromise;

            expect((register as any).buffer.length).toBe(0);
        });
    });

    describe("오류 처리", () => {
        it("잘못된 데이터를 처리할 때 에러를 발생시켜야 한다", async () => {
            const errorPromise = new Promise((resolve) => {
                register.once("error", resolve);
            });

            const invalidData = {
                ...createOrderBookData("BTC"),
                bids: null,
            } as any;

            register.process(invalidData);

            const error = await errorPromise;
            expect((error as any).error).toBe("Invalid data format");
        });

        it("Redis 연결 실패 시 상태가 변경되어야 한다", async () => {
            // 에러 이벤트와 상태 변경 이벤트 모두 캡처
            const stateChangePromise = new Promise((resolve) => {
                register.once("stateChange", resolve);
            });

            // 에러 이벤트 핸들러 추가
            register.on("error", () => {}); // 에러 이벤트 처리

            mockRedis.emit("error", new Error("Redis connection failed"));

            const stateChange = await stateChangePromise;
            expect((stateChange as any).newState).toBe("REDIS_DISCONNECTED");
        });

        it("Redis 재연결 시 정상 상태로 복구되어야 한다", async () => {
            register.on("error", () => {});

            const stateChanges: string[] = [];
            register.on("stateChange", (event: any) => {
                stateChanges.push(event.newState);
            });

            mockRedis.emit("error", new Error("Redis connection failed"));
            mockRedis.emit("ready");

            expect(stateChanges).toContain("REDIS_DISCONNECTED");
            expect(stateChanges).toContain("RUNNING");
            expect(register.getState()).toBe("RUNNING");
        });
    });

    describe("메모리 관리", () => {
        it("오래된 데이터는 자동으로 제거되어야 한다", async () => {
            const oldData = createOrderBookData("BTC");
            oldData.timestamp = Date.now() - (config.maxDataAge + 1000);

            register.process(oldData);

            jest.advanceTimersByTime(config.healthCheckInterval);

            expect((register as any).buffer.length).toBe(0);
        });

        describe("메모리 관리", () => {
            it("버퍼가 가득 차면 이벤트를 발생시켜야 한다", (done) => {
                const register = new Register({
                    ...config,
                    maxBufferSize: 3, // 테스트를 위해 작은 크기로 설정
                    enableHealthCheck: false,
                });

                register.once("bufferFull", (event) => {
                    try {
                        expect(event.currentSize).toBe(3); // maxBufferSize와 동일
                        expect(event.maxSize).toBe(3);
                        expect(event.timestamp).toBeDefined();
                        expect(event.droppedData).toBeDefined();
                        register.shutdown().then(done);
                    } catch (error) {
                        done(error);
                    }
                });

                // maxBufferSize + 1 개의 데이터 전송
                for (let i = 0; i <= 3; i++) {
                    register.process(createOrderBookData("BTC"));
                }
            });
        });
    });

    describe("종료 처리", () => {
        it("shutdown 시 버퍼의 남은 데이터를 처리해야 한다", async () => {
            const processPromise = new Promise<void>((resolve) => {
                register.once("batchProcessed", () => resolve());
            });

            const dataCount = config.batchSize - 2;
            for (let i = 0; i < dataCount; i++) {
                register.process(createOrderBookData("BTC"));
            }

            await register.shutdown();
            await processPromise;

            expect((register as any).buffer.length).toBe(0);
            expect(mockRedis.quit).toHaveBeenCalled();
        });
    });
});
