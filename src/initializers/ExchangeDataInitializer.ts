import { Redis } from "ioredis"
import { RedisConfig } from "../storage/redis/types"
import { ExchangeInfo } from "../exchanges/common/types"
import { BinanceConnector } from "../exchanges/binance/BinanceConnector"
import { UpbitConnector } from "../exchanges/upbit/UpbitConnector"
import { BybitConnector } from "../exchanges/bybit/BybitConnector"
import { BithumbConnector } from "../exchanges/bithumb/BithumbConnector"

export class ExchangeDataInitializer {
    private readonly DOMESTIC_EXCHANGES = ["upbit", "bithumb", "coinone"]

    private readonly redis: Redis
    private readonly REDIS_KEYS = {
        STANDARDIZED: "standardized",
        MASTER: "master",
    }
    private readonly TTL = 24 * 60 * 60 // 24시간
    private readonly logger: (msg: string) => void

    constructor(redis: Redis, logger: (msg: string) => void = console.log) {
        this.redis = redis
        this.logger = logger

        this.redis.on("error", (err) => {
            console.error("Redis connection error:", err)
        })
    }

    async initialize(exchanges: string[]): Promise<void> {
        this.logger("Initializing exchange data...")

        try {
            // 1. 각 거래소의 데이터 수집 및 표준화된 데이터 저장
            const exchangeDataMap = await this.fetchAndStoreExchangeData(
                exchanges
            )

            // 2. 전체 마스터 데이터 생성 및 저장
            const globalData = await this.storeGlobalMasterData(exchangeDataMap)

            // 3. 거래소별 마스터 데이터 생성 및 저장
            await this.storeExchangeMasterData(exchangeDataMap, globalData)

            this.logger("Exchange data initialization completed")
        } catch (error) {
            console.error("Exchange data initialization failed:", error)
            throw error
        }
    }

    private async fetchAndStoreExchangeData(
        exchanges: string[]
    ): Promise<Map<string, ExchangeInfo[]>> {
        const exchangeDataMap = new Map<string, ExchangeInfo[]>()

        for (const exchange of exchanges) {
            this.logger(`Fetching ${exchange} exchange info...`)
            let exchangeInfo: ExchangeInfo[]

            switch (exchange) {
                case "binance":
                    exchangeInfo = await BinanceConnector.fetchExchangeInfo()
                    break
                case "upbit":
                    exchangeInfo = await UpbitConnector.fetchExchangeInfo()
                    break
                case "bybit":
                    exchangeInfo = await BybitConnector.fetchExchangeInfo()
                    break
                case "bithumb":
                    exchangeInfo = await BithumbConnector.fetchExchangeInfo()
                    break
                default:
                    throw new Error(`Unsupported exchange: ${exchange}`)
            }

            await this.storeStandardizedData(exchangeInfo)
            exchangeDataMap.set(exchange, exchangeInfo)
        }

        return exchangeDataMap
    }

    private async storeStandardizedData(data: ExchangeInfo[]): Promise<void> {
        const pipeline = this.redis.pipeline()
        data.forEach((info) => {
            const key = `${this.REDIS_KEYS.STANDARDIZED}:${info.exchange}:${info.marketSymbol}`
            pipeline.setex(key, this.TTL, JSON.stringify(info))
        })
        await pipeline.exec()
    }

    private async storeGlobalMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Promise<Map<string, ExchangeInfo>> {
        const globalData = new Map<string, ExchangeInfo>()

        for (const [exchange, dataList] of exchangeDataMap.entries()) {
            if (this.DOMESTIC_EXCHANGES.includes(exchange.toLowerCase())) {
                for (const data of dataList) {
                    if (!globalData.has(data.baseSymbol)) {
                        globalData.set(data.baseSymbol, {
                            ...data,
                            additionalInfo: { sourceExchanges: [exchange] },
                        })
                    } else {
                        const existing = globalData.get(data.baseSymbol)!
                        const sourceExchanges = Array.isArray(
                            existing.additionalInfo?.sourceExchanges
                        )
                            ? existing.additionalInfo!.sourceExchanges
                            : []
                        sourceExchanges.push(exchange)
                        existing.additionalInfo = { sourceExchanges }
                    }
                }
            }
        }

        await this.saveGlobalDataToRedis(globalData)
        return globalData
    }

    private async saveGlobalDataToRedis(
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        const pipeline = this.redis.pipeline()

        for (const [marketSymbol, data] of globalData.entries()) {
            const key = `${this.REDIS_KEYS.MASTER}:${marketSymbol}`
            pipeline.setex(key, this.TTL, JSON.stringify(data))
        }

        await pipeline.exec()
    }

    private async storeExchangeMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>,
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        const pipeline = this.redis.pipeline()

        for (const [exchange, dataList] of exchangeDataMap.entries()) {
            for (const data of dataList) {
                if (globalData.has(data.baseSymbol)) {
                    const key = `${this.REDIS_KEYS.MASTER}:${exchange}:${data.marketSymbol}`
                    pipeline.setex(
                        key,
                        this.TTL,
                        JSON.stringify({
                            marketSymbol: data.marketSymbol,
                            baseSymbol: data.baseSymbol,
                            quoteSymbol: data.quoteSymbol,
                            type: data.type,
                            exchange: exchange,
                            status: data.status,
                        })
                    )
                }
            }
        }

        await pipeline.exec()
    }

    async cleanup(): Promise<void> {
        try {
            const patterns = [
                `${this.REDIS_KEYS.STANDARDIZED}:*`,
                `${this.REDIS_KEYS.MASTER}:*`,
            ]

            for (const pattern of patterns) {
                const keys = await this.redis.keys(pattern)
                if (keys.length > 0) {
                    await this.redis.del(...keys)
                }
            }
        } catch (error) {
            console.error("Failed to cleanup Redis storage:", error)
            throw error
        } finally {
            await this.redis.quit()
        }
    }
}
