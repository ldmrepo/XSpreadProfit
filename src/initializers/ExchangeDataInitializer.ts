/**
 * Path: src/initializers/ExchangeDataInitializer.ts
 */

import { Redis } from "ioredis"
import { ExchangeInfo } from "../exchanges/common/types"
import { ExchangeConfig } from "../config/types"
import { BinanceConnector } from "../exchanges/binance/BinanceConnector"
import { BybitConnector } from "../exchanges/bybit/BybitConnector"
import { UpbitConnector } from "../exchanges/upbit/UpbitConnector"
import { CoinoneConnector } from "../exchanges/coinone/CoinoneConnector"
import { BithumbConnector } from "../exchanges/bithumb/BithumbConnector"

export class ExchangeDataInitializer {
    private readonly TTL = 24 * 60 * 60
    private readonly REDIS_KEYS = {
        STANDARDIZED: "standardized",
        MASTER: "master",
    }

    private readonly WS_URLS: Record<string, string> = {
        binance: "wss://stream.binance.com:9443/ws",
        bybit: "wss://stream.bybit.com/v5/public/spot",
        upbit: "wss://api.upbit.com/websocket/v1",
    }

    private readonly STREAM_LIMITS: Record<string, number> = {
        binance: 1024,
        bybit: 200,
        upbit: 15,
    }

    constructor(
        private readonly redis: Redis,
        private readonly logger: (msg: string) => void = console.log
    ) {}

    async initialize(exchanges: ExchangeConfig[]): Promise<ExchangeConfig[]> {
        this.logger("Initializing exchange data...")

        try {
            const exchangeDataMap = await this.fetchAndStoreExchangeData(
                exchanges
            )
            const globalData = await this.storeGlobalMasterData(exchangeDataMap)
            await this.storeExchangeMasterData(exchangeDataMap, globalData)

            const configs = exchanges.map((exchange) => {
                const marketData =
                    exchangeDataMap.get(
                        `${exchange.exchange}:${exchange.exchangeType}`
                    ) || []
                return this.createExchangeConfig(exchange, marketData)
            })

            this.logger("Exchange data initialization completed")
            return configs
        } catch (error) {
            this.logger(`Failed to initialize exchange data: ${error}`)
            throw error
        }
    }

    private createExchangeConfig(
        exchange: ExchangeConfig,
        markets: ExchangeInfo[]
    ): ExchangeConfig {
        return {
            exchange: exchange.exchange,
            exchangeType: exchange.exchangeType,
            url: exchange.url,
            wsUrl: this.WS_URLS[exchange.exchange] || "",
            streamLimit: this.STREAM_LIMITS[exchange.exchange] || 100,
            symbols: markets
                .filter((m) => m.status === "active")
                .map((m) => m.marketSymbol),
        }
    }

    private async fetchAndStoreExchangeData(
        exchanges: ExchangeConfig[]
    ): Promise<Map<string, ExchangeInfo[]>> {
        const exchangeDataMap = new Map<string, ExchangeInfo[]>()

        for (const exchange of exchanges) {
            this.logger(`Fetching ${exchange} exchange info...`)
            let exchangeInfo: ExchangeInfo[]

            switch (exchange.exchange) {
                case "binance":
                    if (exchange.exchangeType === "future") {
                        exchangeInfo =
                            await BinanceConnector.fetchFuturesExchangeInfo(
                                exchange
                            )
                    } else {
                        exchangeInfo =
                            await BinanceConnector.fetchSpotExchangeInfo(
                                exchange
                            )
                    }
                    break
                case "bybit":
                    if (exchange.exchangeType === "future") {
                        exchangeInfo =
                            await BybitConnector.fetchSpotExchangeInfo(exchange)
                    } else {
                        exchangeInfo =
                            await BybitConnector.fetchFuturesExchangeInfo(
                                exchange
                            )
                    }
                    break
                case "upbit":
                    if (exchange.exchangeType === "future") {
                        throw new Error("Upbit does not support futures")
                    }
                    exchangeInfo = await UpbitConnector.fetchSpotExchangeInfo(
                        exchange
                    )
                    break
                case "coinone":
                    if (exchange.exchangeType === "future") {
                        throw new Error("Coinone does not support futures")
                    }
                    exchangeInfo = await CoinoneConnector.fetchSpotExchangeInfo(
                        exchange
                    )
                    break
                case "bithumb":
                    if (exchange.exchangeType === "future") {
                        throw new Error("Bithumb does not support futures")
                    }
                    exchangeInfo = await BithumbConnector.fetchSpotExchangeInfo(
                        exchange
                    )
                    break
                default:
                    throw new Error(`Unsupported exchange: ${exchange}`)
            }

            await this.storeStandardizedData(exchangeInfo)
            exchangeDataMap.set(
                `${exchange.exchange}:${exchange.exchangeType}`,
                exchangeInfo
            )
        }

        return exchangeDataMap
    }

    private async storeStandardizedData(data: ExchangeInfo[]): Promise<void> {
        const pipeline = this.redis.pipeline()
        data.forEach((info) => {
            const key = `${this.REDIS_KEYS.STANDARDIZED}:${info.exchange}:${info.exchangeType}:${info.marketSymbol}`
            pipeline.setex(key, this.TTL, JSON.stringify(info))
        })
        await pipeline.exec()
    }

    public processGlobalData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Map<string, ExchangeInfo> {
        const globalData = new Map<string, ExchangeInfo>()
        // exchangeKey : exchange:type
        for (const [exchangeKey, dataList] of exchangeDataMap.entries()) {
            for (const data of dataList) {
                const baseSymbol = data.baseSymbol

                if (!globalData.has(baseSymbol)) {
                    globalData.set(
                        baseSymbol,
                        this.createInitialGlobalData(data, exchangeKey)
                    )
                    continue
                }

                this.updateExistingGlobalData(
                    globalData.get(baseSymbol)!,
                    exchangeKey
                )
            }
        }

        return globalData
    }

    private createInitialGlobalData(
        data: ExchangeInfo,
        exchangeKey: string
    ): ExchangeInfo {
        return {
            marketSymbol: data.marketSymbol,
            baseSymbol: data.baseSymbol,
            quoteSymbol: data.quoteSymbol,
            exchangeType: data.exchangeType,
            exchange: data.exchange,
            status: data.status,
            additionalInfo: {
                sourceExchanges: [exchangeKey],
            },
        }
    }

    private updateExistingGlobalData(
        existingData: ExchangeInfo,
        exchange: string
    ): void {
        const sourceExchanges =
            (existingData.additionalInfo?.sourceExchanges as string[]) || []
        sourceExchanges.push(exchange)
        existingData.additionalInfo = {
            ...existingData.additionalInfo,
            sourceExchanges,
        }
    }

    // 거래소 통합 대상 데이터 저장
    private async storeGlobalMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Promise<Map<string, ExchangeInfo>> {
        const globalData = this.processGlobalData(exchangeDataMap)
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
    // 거래소별 표준화된 마스터 데이터 저장
    private async storeExchangeMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>,
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        const pipeline = this.redis.pipeline()

        for (const [exchangeKey, dataList] of exchangeDataMap.entries()) {
            for (const data of dataList) {
                if (globalData.has(data.baseSymbol)) {
                    const redisKey = `${this.REDIS_KEYS.MASTER}:${exchangeKey}:${data.marketSymbol}`
                    pipeline.setex(
                        redisKey,
                        this.TTL,
                        JSON.stringify({
                            exchange: data.exchange,
                            exchangeType: data.exchangeType,
                            marketSymbol: data.marketSymbol,
                            baseSymbol: data.baseSymbol,
                            quoteSymbol: data.quoteSymbol,
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
        }
    }
}
