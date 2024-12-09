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

    test("Binance 거래소 데이터 저장 테스트", async () => {
        const result = await BinanceConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)
        await testStoreStandardizedData("binance", result)
    })

    test("Upbit 거래소 데이터 저장 테스트", async () => {
        const result = await UpbitConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)
        await testStoreStandardizedData("upbit", result)
    })

    test("Bybit 거래소 데이터 저장 테스트", async () => {
        const result = await BybitConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)
        await testStoreStandardizedData("bybit", result)
    })

    test("Bithumb 거래소 데이터 저장 테스트", async () => {
        const result = await BithumbConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)
        await testStoreStandardizedData("bithumb", result)
    })

    test("Coinone 거래소 데이터 저장 테스트", async () => {
        const result = await CoinoneConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)
        await testStoreStandardizedData("coinone", result)
    })
})
