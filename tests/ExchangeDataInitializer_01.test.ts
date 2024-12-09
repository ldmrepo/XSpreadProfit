/**
 * Path: tests/ExchangeDataInitializer.integration.test.ts
 */
import { ExchangeDataInitializer } from "../src/initializers/ExchangeDataInitializer"
import { RedisConfig } from "../src/storage/redis/types"
import { BinanceConnector } from "../src/exchanges/binance/BinanceConnector"
import { UpbitConnector } from "../src/exchanges/upbit/UpbitConnector"
import { BybitConnector } from "../src/exchanges/bybit/BybitConnector"
import { BithumbConnector } from "../src/exchanges/bithumb/BithumbConnector"
import { CoinoneConnector } from "../src/exchanges/coinone/CoinoneConnector"
import Redis from "ioredis"

describe("ExchangeDataInitializer 거래소 데이터 수집 테스트", () => {
    let initializer: ExchangeDataInitializer
    const redisConfig: RedisConfig = { host: "localhost", port: 6379 }
    let redisClient: Redis

    beforeAll(() => {
        initializer = new ExchangeDataInitializer(redisConfig)
        redisClient = new Redis(redisConfig)
    })

    afterAll(async () => {
        await redisClient.quit()
    })

    afterEach(async () => {
        // 테스트 후 Redis 데이터 정리
        // const keys = await redisClient.keys("standardized:*")
        // if (keys.length > 0) {
        //     await redisClient.del(...keys)
        // }
    })
    const testStoreStandardizedData = async (exchange: string, data: any[]) => {
        await initializer["storeStandardizedData"](data)

        for (const item of data) {
            const key = `standardized:${exchange}:${item.marketSymbol}`
            const storedData = await redisClient.get(key)
            expect(storedData).not.toBeNull()
            expect(JSON.parse(storedData!)).toEqual(item)
        }
    }

    test("Binance 거래소의 fetchExchangeInfo 함수 테스트", async () => {
        const result = await BinanceConnector.fetchExchangeInfo()
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        console.log("result", result[0])
        result.forEach((info) => {
            expect(info).toHaveProperty("exchange", "binance")
            expect(info).toHaveProperty("marketSymbol")
            expect(info).toHaveProperty("baseSymbol")
            expect(info).toHaveProperty("quoteSymbol")
        })
    })

    test("Upbit 거래소의 fetchExchangeInfo 함수 테스트", async () => {
        const result = await UpbitConnector.fetchExchangeInfo()
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        console.log("result", result[0])
        result.forEach((info) => {
            expect(info).toHaveProperty("exchange", "upbit")
            expect(info).toHaveProperty("marketSymbol")
            expect(info).toHaveProperty("baseSymbol")
            expect(info).toHaveProperty("quoteSymbol")
        })
    })

    test("Bybit 거래소의 fetchExchangeInfo 함수 테스트", async () => {
        const result = await BybitConnector.fetchExchangeInfo()
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        console.log("result", result[0])
        result.forEach((info) => {
            expect(info).toHaveProperty("exchange", "bybit")
            expect(info).toHaveProperty("marketSymbol")
            expect(info).toHaveProperty("baseSymbol")
            expect(info).toHaveProperty("quoteSymbol")
        })
    })

    test("Bithumb 거래소의 fetchExchangeInfo 함수 테스트", async () => {
        const result = await BithumbConnector.fetchExchangeInfo()
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        console.log("result", result[0])
        result.forEach((info) => {
            expect(info).toHaveProperty("exchange", "bithumb")
            expect(info).toHaveProperty("marketSymbol")
            expect(info).toHaveProperty("baseSymbol")
            expect(info).toHaveProperty("quoteSymbol")
        })
    })

    test("Coinone 거래소의 fetchExchangeInfo 함수 테스트", async () => {
        const result = await CoinoneConnector.fetchExchangeInfo()
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        console.log("result", result[0])
        result.forEach((info) => {
            expect(info).toHaveProperty("exchange", "coinone")
            expect(info).toHaveProperty("marketSymbol")
            expect(info).toHaveProperty("baseSymbol")
            expect(info).toHaveProperty("quoteSymbol")
        })
    })
})
