/**
 * Path: tests/ExchangeDataInitializer.integration.test.ts
 */
import { ExchangeDataInitializer } from "../src/initializers/ExchangeDataInitializer"
import { RedisConfig } from "../src/storage/redis/types"
import Redis from "ioredis"
import { BinanceConnector } from "../src/exchanges/binance/BinanceConnector"
import { UpbitConnector } from "../src/exchanges/upbit/UpbitConnector"
import { BybitConnector } from "../src/exchanges/bybit/BybitConnector"
import { BithumbConnector } from "../src/exchanges/bithumb/BithumbConnector"
import { CoinoneConnector } from "../src/exchanges/coinone/CoinoneConnector"
import { ExchangeInfo } from "../src/exchanges/common/types"

describe("ExchangeDataInitializer 실제 데이터 테스트", () => {
    const redisConfig: RedisConfig = { host: "localhost", port: 6379 }
    let redis: Redis
    let logger: jest.Mock
    let initializer: ExchangeDataInitializer

    beforeAll(() => {
        redis = new Redis(redisConfig)
        logger = jest.fn((msg: string) => console.log(msg))
        initializer = new ExchangeDataInitializer(redis, logger)
    })

    afterAll(async () => {
        await redis.flushall()
        await redis.quit()
    })

    afterEach(async () => {
        await redis.flushall()
        logger.mockClear()
    })

    test("storeStandardizedData 테스트 - Binance", async () => {
        const result = await BinanceConnector.fetchExchangeInfo()
        expect(result.length).toBeGreaterThan(0)

        await initializer["storeStandardizedData"](result)

        for (const data of result) {
            const key = `standardized:binance:${data.marketSymbol}`
            const storedData = await redis.get(key)
            console.log(`Stored data for key ${key}:`, storedData)
            expect(storedData).not.toBeNull()
            expect(JSON.parse(storedData!)).toEqual(data)
        }

        expect(logger).toHaveBeenCalled()
    })

    test("storeGlobalMasterData 테스트", async () => {
        const exchangeDataMap = new Map<string, ExchangeInfo[]>()

        const exchanges = ["upbit", "bithumb", "coinone"]
        for (const exchange of exchanges) {
            let result
            switch (exchange) {
                case "upbit":
                    result = await UpbitConnector.fetchExchangeInfo()
                    break
                case "bithumb":
                    result = await BithumbConnector.fetchExchangeInfo()
                    break
                case "coinone":
                    result = await CoinoneConnector.fetchExchangeInfo()
                    break
                default:
                    throw new Error(`Unsupported exchange: ${exchange}`)
            }
            exchangeDataMap.set(exchange, result)
        }

        const globalData = await initializer["storeGlobalMasterData"](
            exchangeDataMap
        )

        for (const [marketSymbol, data] of globalData.entries()) {
            const key = `master:${marketSymbol}`
            const storedData = await redis.get(key)
            console.log(`Stored global data for key ${key}:`, storedData)
            expect(storedData).not.toBeNull()
            expect(JSON.parse(storedData!)).toEqual(data)
        }

        expect(logger).toHaveBeenCalled()
    })

    test("storeExchangeMasterData 테스트", async () => {
        const exchangeDataMap = new Map<string, ExchangeInfo[]>()

        const exchanges = ["binance", "upbit", "bithumb", "bybit", "coinone"]
        for (const exchange of exchanges) {
            let result
            switch (exchange) {
                case "binance":
                    result = await BinanceConnector.fetchExchangeInfo()
                    break
                case "upbit":
                    result = await UpbitConnector.fetchExchangeInfo()
                    break
                case "bithumb":
                    result = await BithumbConnector.fetchExchangeInfo()
                    break
                case "bybit":
                    result = await BybitConnector.fetchExchangeInfo()
                    break
                case "coinone":
                    result = await CoinoneConnector.fetchExchangeInfo()
                    break
                default:
                    throw new Error(`Unsupported exchange: ${exchange}`)
            }
            exchangeDataMap.set(exchange, result)
        }

        const globalData = await initializer["storeGlobalMasterData"](
            exchangeDataMap
        )

        await initializer["storeExchangeMasterData"](
            exchangeDataMap,
            globalData
        )

        for (const [exchange, dataList] of exchangeDataMap.entries()) {
            for (const data of dataList) {
                const key = `master:${exchange}:${data.marketSymbol}`
                const storedData = await redis.get(key)
                console.log(`Stored exchange data for key ${key}:`, storedData)
                expect(storedData).not.toBeNull()
                expect(JSON.parse(storedData!)).toEqual({
                    marketSymbol: data.marketSymbol,
                    baseSymbol: data.baseSymbol,
                    quoteSymbol: data.quoteSymbol,
                    type: data.type,
                    exchange: exchange,
                    status: data.status,
                })
            }
        }

        expect(logger).toHaveBeenCalled()
    })
})
