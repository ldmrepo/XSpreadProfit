import { Redis } from "ioredis"
import { RedisConfig } from "../storage/redis/types"
import { ExchangeInfo } from "../exchanges/common/types"
import { BinanceConnector } from "../exchanges/binance/BinanceConnector"
import { UpbitConnector } from "../exchanges/upbit/UpbitConnector"
import { BybitConnector } from "../exchanges/bybit/BybitConnector"
import { BithumbConnector } from "../exchanges/bithumb/BithumbConnector"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types"

export class ExchangeDataInitializer {
    private readonly DOMESTIC_EXCHANGES = ["upbit", "bithumb", "coinone"]

    private readonly redis: Redis
    private readonly REDIS_KEYS = {
        STANDARDIZED: "standardized",
        MASTER: "master",
    }
    private readonly TTL = 24 * 60 * 60 // 24시간

    constructor(config: RedisConfig) {
        this.redis = new Redis({
            ...config,
            retryStrategy: (times: number) => Math.min(times * 50, 2000),
        })

        this.redis.on("error", (err) => {
            console.error("Redis connection error:", err)
        })
    }

    async initialize(exchanges: string[]): Promise<void> {
        console.log("Initializing exchange data...")

        try {
            // 1. 각 거래소의 데이터 수집 및 표준화된 데이터 저장
            const exchangeDataMap = new Map<string, ExchangeInfo[]>()

            for (const exchange of exchanges) {
                console.log(`Fetching ${exchange} exchange info...`)
                let exchangeInfo: ExchangeInfo[]

                // 각 거래소의 fetchExchangeInfo 호출
                switch (exchange) {
                    case "binance":
                        exchangeInfo =
                            await BinanceConnector.fetchExchangeInfo()
                        break
                    case "upbit":
                        exchangeInfo = await UpbitConnector.fetchExchangeInfo()
                        break
                    case "bybit":
                        exchangeInfo = await BybitConnector.fetchExchangeInfo()
                        break
                    case "bithumb":
                        exchangeInfo =
                            await BithumbConnector.fetchExchangeInfo()
                        break
                    default:
                        throw new Error(`Unsupported exchange: ${exchange}`)
                }

                // 표준화된 데이터 저장
                await this.storeStandardizedData(exchangeInfo)
                exchangeDataMap.set(exchange, exchangeInfo)
            }

            // 2. 전체 마스터 데이터 생성 및 저장
            const globalData = await this.storeGlobalMasterData(exchangeDataMap)

            // 3. 거래소별 마스터 데이터 생성 및 저장
            await this.storeExchangeMasterData(exchangeDataMap, globalData)

            console.log("Exchange data initialization completed")
        } catch (error) {
            console.error("Exchange data initialization failed:", error)
            throw error
        }
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
                        // 새 항목 추가
                        globalData.set(data.baseSymbol, {
                            ...data,
                            additionalInfo: {
                                sourceExchanges: [exchange],
                            },
                        })
                    } else {
                        // 기존 항목 업데이트
                        const existing = globalData.get(data.baseSymbol)!

                        if (
                            existing.additionalInfo &&
                            typeof existing.additionalInfo === "object"
                        ) {
                            const sourceExchanges = Array.isArray(
                                existing.additionalInfo.sourceExchanges
                            )
                                ? existing.additionalInfo.sourceExchanges
                                : []
                            sourceExchanges.push(exchange)

                            existing.additionalInfo = {
                                ...existing.additionalInfo,
                                sourceExchanges,
                            }
                        } else {
                            existing.additionalInfo = {
                                sourceExchanges: [exchange],
                            }
                        }
                    }
                }
            }
        }

        // Redis에 저장
        const pipeline = this.redis.pipeline()
        for (const [marketSymbol, data] of globalData.entries()) {
            const key = `${this.REDIS_KEYS.MASTER}:${marketSymbol}`
            pipeline.setex(key, this.TTL, JSON.stringify(data))
        }
        await pipeline.exec()

        return globalData
    }

    // 국내 거래소 데이터 필터링 함수
    private filterDomesticExchanges(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Map<string, ExchangeInfo[]> {
        const domesticDataMap = new Map<string, ExchangeInfo[]>()
        for (const [exchange, data] of exchangeDataMap.entries()) {
            if (this.DOMESTIC_EXCHANGES.includes(exchange.toLowerCase())) {
                domesticDataMap.set(exchange, data)
            }
        }
        return domesticDataMap
    }

    // 국내 거래소 baseSymbol 정보를 기준으로 통합 함수
    private aggregateGlobalDataByBaseSymbol(
        domesticDataMap: Map<string, ExchangeInfo[]>
    ): Map<string, Set<string>> {
        const globalData = new Map<string, Set<string>>()

        for (const [exchange, dataList] of domesticDataMap.entries()) {
            for (const data of dataList) {
                const baseSymbol = data.baseSymbol
                if (!globalData.has(baseSymbol)) {
                    globalData.set(baseSymbol, new Set([exchange]))
                } else {
                    globalData.get(baseSymbol)!.add(exchange)
                }
            }
        }

        return globalData
    }

    // Redis에 데이터 저장 함수
    private async saveGlobalDataToRedis(
        globalData: Map<string, Set<string>>,
        domesticDataMap: Map<string, ExchangeInfo[]>
    ): Promise<void> {
        const pipeline = this.redis.pipeline()

        for (const [baseSymbol, exchanges] of globalData.entries()) {
            const key = `${this.REDIS_KEYS.MASTER}:${baseSymbol}`
            const data = Array.from(domesticDataMap.values())
                .flat()
                .find((info) => info.baseSymbol === baseSymbol)

            if (!data) {
                console.warn(`No data found for baseSymbol: ${baseSymbol}`)
                continue // 데이터가 없는 경우 스킵
            }

            pipeline.setex(
                key,
                this.TTL,
                JSON.stringify({
                    ...data,
                    additionalInfo: {
                        ...data.additionalInfo,
                        sourceExchanges: Array.from(exchanges),
                    },
                })
            )
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
