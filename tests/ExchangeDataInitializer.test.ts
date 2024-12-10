import { ExchangeDataInitializer } from "../src/initializers/ExchangeDataInitializer"
import { ExchangeInfo } from "../src/exchanges/common/types"
import Redis from "ioredis"
import { ExchangeConfig } from "../src/config/types"

describe("ExchangeDataInitializer", () => {
    let redis: Redis
    let initializer: ExchangeDataInitializer
    let mockLogger: jest.Mock

    const mockExchangeConfigs: ExchangeConfig[] = [
        {
            exchange: "binance",
            exchangeType: "spot",
            url: "https://api.binance.com",
            wsUrl: "wss://stream.binance.com:9443/ws",
            streamLimit: 1024,
            symbols: [],
        },
        {
            exchange: "binance",
            exchangeType: "future",
            url: "https://fapi.binance.com",
            wsUrl: "wss://fstream.binance.com/ws",
            streamLimit: 1024,
            symbols: [],
        },
        {
            exchange: "bybit",
            exchangeType: "spot",
            url: process.env.BYBIT_URL || "https://api.bybit.com",
            wsUrl:
                process.env.BYBIT_WS_URL ||
                "wss://stream.bybit.com/v5/public/spot",
            streamLimit: parseInt(process.env.BYBIT_STREAM_LIMIT || "200", 10),
            symbols: [],
        },
        {
            exchange: "bybit",
            exchangeType: "future",
            url: process.env.BYBIT_URL || "https://api.bybit.com",
            wsUrl:
                process.env.BYBIT_WS_URL || "wss://stream.bybit.com/realtime",
            streamLimit: parseInt(process.env.BYBIT_STREAM_LIMIT || "200", 10),
            symbols: [],
        },
        {
            exchange: "upbit",
            exchangeType: "spot",
            url: "https://api.upbit.com",
            wsUrl: "wss://api.upbit.com/websocket/v1",
            streamLimit: 15,
            symbols: [],
        },
        {
            exchange: "bithumb",
            exchangeType: "spot",
            url: "https://api.bithumb.com",
            wsUrl: "wss://pubwss.bithumb.com/pub/ws",
            streamLimit: 15,
            symbols: [],
        },
        {
            exchange: "coinone",
            exchangeType: "spot",
            url: "https://api.coinone.co.kr",
            wsUrl: "wss://push.coinone.co.kr/ws",
            streamLimit: 15,
            symbols: [],
        },
    ]

    beforeEach(async () => {
        redis = await new Redis({
            host: "localhost", // Redis 서버 호스트
            port: 6379, // Redis 서버 포트
            // password: "redispass", // 필요한 경우
            db: 0, // 테스트용 DB 번호
        })
        mockLogger = jest.fn()
        initializer = new ExchangeDataInitializer(redis, mockLogger)
    })

    afterEach(async () => {
        // await initializer.cleanup()
        jest.clearAllMocks()
    })

    describe("initialize", () => {
        it("should initialize exchange data successfully", async () => {
            const result = await initializer.initialize(mockExchangeConfigs)

            expect(result.length).toBeGreaterThan(0)
        })

        it.skip("should throw error for unsupported exchange", async () => {
            const invalidConfig = [
                {
                    exchange: "binance",
                    exchangeType: "spot",
                    url: "https://api.binance.com",
                    wsUrl: "wss://stream.binance.com:9443/ws",
                    streamLimit: 1000,
                    symbols: [],
                },
            ]

            await expect(initializer.initialize(invalidConfig)).rejects.toThrow(
                "Unsupported exchange"
            )
        })

        it.skip("should throw error for unsupported futures market", async () => {
            const futuresConfig = [
                {
                    exchange: "binance",
                    exchangeType: "future",
                    url: process.env.BINANCE_URL || "https://fapi.binance.com",
                    wsUrl:
                        process.env.BINANCE_WS_URL ||
                        "wss://fstream.binance.com/ws",
                    streamLimit: parseInt(
                        process.env.BINANCE_STREAM_LIMIT || "1024",
                        10
                    ),
                    symbols: [],
                },
            ]
            await expect(initializer.initialize(futuresConfig)).rejects.toThrow(
                "Upbit does not support futures"
            )
        })
    })

    describe.skip("Redis operations", () => {
        it("should store and cleanup Redis data correctly", async () => {
            await initializer.initialize(mockExchangeConfigs)

            // Verify data is stored
            const standardizedKeys = await redis.keys("standardized:*")
            const masterKeys = await redis.keys("master:*")

            expect(standardizedKeys.length).toBeGreaterThan(0)
            expect(masterKeys.length).toBeGreaterThan(0)

            // Test cleanup
            await initializer.cleanup()

            const remainingKeys = await redis.keys("*")
            expect(remainingKeys.length).toBe(0)
        })

        it("should handle Redis errors gracefully", async () => {
            // Simulate Redis error
            jest.spyOn(redis, "pipeline").mockImplementation(() => {
                throw new Error("Redis connection error")
            })

            await expect(
                initializer.initialize(mockExchangeConfigs)
            ).rejects.toThrow("Redis connection error")
        })
    })

    describe.skip("Exchange specific tests", () => {
        it("should handle Binance spot markets correctly", async () => {
            const binanceConfig = [mockExchangeConfigs[0]]
            const result = await initializer.initialize(binanceConfig)

            expect(result[0].exchange).toBe("binance")
            expect(result[0].symbols).toContain("BTCUSDT")
            expect(result[0].symbols).toContain("ETHUSDT")
        })

        it("should handle Upbit spot markets correctly", async () => {
            const upbitConfig = [mockExchangeConfigs[1]]
            const result = await initializer.initialize(upbitConfig)

            expect(result[0].exchange).toBe("upbit")
            expect(result[0].symbols).toContain("BTC-USDT")
        })
    })
})
