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
        PUBLIC: "public",
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

    initialize(exchanges: ExchangeConfig[]): Promise<ExchangeConfig[]> {
        return new Promise(async (resolve, reject) => {
            if (!exchanges || exchanges.length === 0) {
                reject(new Error("No exchange configurations provided"))
                return
            }

            try {
                // 거래소 데이터 가져오기 및 저장
                const exchangeDataMap = await this.fetchAndStoreExchangeData(
                    exchanges
                ).catch((error) => {
                    throw new Error(
                        `Failed to fetch and store exchange data: ${error.message}`
                    )
                })

                // 글로벌 마스터 데이터 저장
                const globalData = await this.storeGlobalMasterData(
                    exchangeDataMap
                ).catch((error) => {
                    throw new Error(
                        `Failed to store global master data: ${error.message}`
                    )
                })
                console.log("globalData", globalData.size)
                // 거래소별 마스터 데이터 저장
                await this.storeExchangeMasterData(
                    exchangeDataMap,
                    globalData
                ).catch((error) => {
                    throw new Error(
                        `Failed to store exchange master data: ${error.message}`
                    )
                })

                // 설정 생성
                const configs = exchanges.map((exchange) => {
                    try {
                        const exchangeKey = `${exchange.exchange}:${exchange.exchangeType}`
                        const marketData = exchangeDataMap.get(exchangeKey)

                        if (!marketData) {
                            throw new Error(
                                `No market data found for exchange: ${exchangeKey}`
                            )
                        }

                        return this.createExchangeConfig(exchange, marketData)
                    } catch (error: any) {
                        throw new Error(
                            `Failed to create config for ${exchange.exchange}: ${error.message}`
                        )
                    }
                })

                this.logger("Exchange data initialization completed")
                resolve(configs)
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error)
                this.logger(
                    `Failed to initialize exchange data: ${errorMessage}`
                )
                reject(
                    new Error(`Exchange initialization failed: ${errorMessage}`)
                )
            }
        })
    }

    private createExchangeConfig(
        exchange: ExchangeConfig,
        markets: ExchangeInfo[]
    ): ExchangeConfig {
        return {
            exchange: exchange.exchange,
            exchangeType: exchange.exchangeType,
            url: exchange.url,
            wsUrl: exchange.wsUrl, //this.WS_URLS[exchange.exchange] || "",
            streamLimit: exchange.streamLimit || 100,
            used: exchange.used,
            symbols: markets
                .filter((m) => m.status === "active")
                .map((m) => m.marketSymbol),
        }
    }

    private fetchAndStoreExchangeData(
        exchanges: ExchangeConfig[]
    ): Promise<Map<string, ExchangeInfo[]>> {
        return new Promise(async (resolve, reject) => {
            if (!exchanges || exchanges.length === 0) {
                reject(new Error("No exchange configurations provided"))
                return
            }

            const exchangeDataMap = new Map<string, ExchangeInfo[]>()
            try {
                for (const exchange of exchanges) {
                    let exchangeInfo: ExchangeInfo[]
                    try {
                        exchangeInfo = await this.fetchExchangeInfo(exchange)

                        await this.storeStandardizedData(exchangeInfo).catch(
                            (error) => {
                                throw new Error(
                                    `Failed to store standardized data for ${exchange.exchange}: ${error.message}`
                                )
                            }
                        )

                        exchangeDataMap.set(
                            `${exchange.exchange}:${exchange.exchangeType}`,
                            exchangeInfo
                        )
                    } catch (error: any) {
                        reject(
                            new Error(
                                `Failed to process ${exchange.exchange}: ${error.message}`
                            )
                        )
                        return
                    }
                }

                resolve(exchangeDataMap)
            } catch (error: any) {
                reject(
                    new Error(
                        `Failed to fetch and store exchange data: ${error.message}`
                    )
                )
            }
        })
    }

    // 거래소별 데이터 조회 로직을 별도 메서드로 분리
    private fetchExchangeInfo(
        exchange: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        return new Promise(async (resolve, reject) => {
            if (!exchange || !exchange.exchange || !exchange.exchangeType) {
                reject(new Error("Invalid exchange configuration"))
                return
            }

            if (!exchange.used) {
                resolve([])
                return
            }

            try {
                let exchangeInfo: ExchangeInfo[]

                switch (exchange.exchange) {
                    case "binance":
                        if (
                            exchange.exchangeType === "future" &&
                            exchange.used
                        ) {
                            exchangeInfo =
                                await BinanceConnector.fetchFuturesExchangeInfo(
                                    exchange
                                )
                        } else if (exchange.exchangeType === "spot") {
                            console.log("binance spot")
                            exchangeInfo =
                                await BinanceConnector.fetchSpotExchangeInfo(
                                    exchange
                                )
                        } else {
                            throw new Error(
                                `Unsupported exchange type: ${exchange.exchangeType}`
                            )
                        }
                        break

                    case "bybit":
                        if (exchange.exchangeType === "future") {
                            exchangeInfo =
                                await BybitConnector.fetchFuturesExchangeInfo(
                                    exchange
                                )
                        } else if (exchange.exchangeType === "spot") {
                            exchangeInfo =
                                await BybitConnector.fetchSpotExchangeInfo(
                                    exchange
                                )
                        } else {
                            throw new Error(
                                `Unsupported exchange type: ${exchange.exchangeType}`
                            )
                        }
                        break

                    case "upbit":
                        if (exchange.exchangeType === "future") {
                            throw new Error("Upbit does not support futures")
                        }
                        exchangeInfo =
                            await UpbitConnector.fetchSpotExchangeInfo(exchange)
                        break

                    case "coinone":
                        if (exchange.exchangeType === "future") {
                            throw new Error("Coinone does not support futures")
                        }
                        exchangeInfo =
                            await CoinoneConnector.fetchSpotExchangeInfo(
                                exchange
                            )
                        break

                    case "bithumb":
                        if (exchange.exchangeType === "future") {
                            throw new Error("Bithumb does not support futures")
                        }
                        exchangeInfo =
                            await BithumbConnector.fetchSpotExchangeInfo(
                                exchange
                            )
                        break

                    default:
                        throw new Error(
                            `Unsupported exchange: ${exchange.exchange}`
                        )
                }

                if (!exchangeInfo || !Array.isArray(exchangeInfo)) {
                    throw new Error(
                        `Failed to fetch exchange info for ${exchange.exchange}`
                    )
                }

                resolve(exchangeInfo)
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error)
                reject(
                    new Error(
                        `Error fetching ${exchange.exchange} ${exchange.exchangeType} data: ${errorMessage}`
                    )
                )
            }
        })
    }

    private storeStandardizedData(data: ExchangeInfo[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const pipeline = this.redis.pipeline()

            data.forEach((info) => {
                const key = `${this.REDIS_KEYS.STANDARDIZED}:${info.exchange}:${info.exchangeType}:${info.marketSymbol}`
                pipeline.setex(key, this.TTL, JSON.stringify(info))
            })

            pipeline
                .exec()
                .then((results) => {
                    // pipeline.exec()은 [Error, Result][] 형태의 배열을 반환
                    const errors = results?.filter(([err]) => err) || []
                    if (errors.length > 0) {
                        reject(
                            new Error(
                                `Failed to store standardized data: ${errors[0][0]}`
                            )
                        )
                    } else {
                        resolve()
                    }
                })
                .catch((error) => {
                    reject(
                        new Error(`Pipeline execution failed: ${error.message}`)
                    )
                })
        })
    }

    public processGlobalData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Map<string, ExchangeInfo> {
        const globalData = new Map<string, ExchangeInfo>()
        const KOREAN_EXCHANGES = ["upbit", "bithumb", "coinone"]

        // 먼저 국내 거래소 데이터만 필터링
        for (const [exchangeKey, dataList] of exchangeDataMap.entries()) {
            const [exchange] = exchangeKey.split(":")
            if (!KOREAN_EXCHANGES.includes(exchange)) continue

            for (const data of dataList) {
                const baseSymbol = data.baseSymbol

                if (!globalData.has(baseSymbol)) {
                    globalData.set(
                        baseSymbol,
                        this.createInitialGlobalData(data, exchangeKey)
                    )
                } else {
                    this.updateExistingGlobalData(
                        globalData.get(baseSymbol)!,
                        exchangeKey
                    )
                }
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
            maxOrderQty: data.maxOrderQty, // 주문 최대 수량
            minOrderQty: data.minOrderQty, // 주문 최소 수량
            minPrice: data.minPrice, // 주문 최소 가격
            maxPrice: data.maxPrice, // 주문 최대 가격
            isWithdrawalEnabled: data.isWithdrawalEnabled, // 출금 가능 여부
            isDepositEnabled: data.isDepositEnabled, // 입금 가능 여부
            additionalInfo: {
                sourceExchanges: [exchangeKey],
                firstRegistered: new Date().toISOString(),
                totalExchanges: 1,
            },
        }
    }

    private updateExistingGlobalData(
        existingData: ExchangeInfo,
        exchange: string
    ): void {
        const sourceExchanges =
            (existingData.additionalInfo?.sourceExchanges as string[]) || []

        // 중복 체크
        if (!sourceExchanges.includes(exchange)) {
            sourceExchanges.push(exchange)

            existingData.additionalInfo = {
                ...existingData.additionalInfo,
                sourceExchanges,
                totalExchanges: sourceExchanges.length,
                lastUpdated: new Date().toISOString(),
            }
        }
    }

    // 전체 마스터 데이터
    private storeGlobalMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Promise<Map<string, ExchangeInfo>> {
        return new Promise(async (resolve, reject) => {
            if (!exchangeDataMap || exchangeDataMap.size === 0) {
                reject(new Error("Empty or invalid exchange data map"))
                return
            }

            try {
                // 글로벌 데이터 처리
                const globalData = await Promise.resolve(
                    this.processGlobalData(exchangeDataMap)
                ).catch((error) => {
                    throw new Error(
                        `Failed to process global data: ${error.message}`
                    )
                })

                if (!globalData || globalData.size === 0) {
                    throw new Error(
                        "No global data generated from exchange data"
                    )
                }

                // Redis에 글로벌 데이터 저장
                await this.saveGlobalDataToRedis(globalData).catch((error) => {
                    throw new Error(
                        `Failed to save global data to Redis: ${error.message}`
                    )
                })
                resolve(globalData)
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error)
                reject(
                    new Error(
                        `Global master data store failed: ${errorMessage}`
                    )
                )
            }
        })
    }

    private saveGlobalDataToRedis(
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!globalData || globalData.size === 0) {
                reject(new Error("No global data to save"))
                return
            }

            const pipeline = this.redis.pipeline()

            try {
                for (const [marketSymbol, data] of globalData.entries()) {
                    if (!marketSymbol || !data) {
                        throw new Error(
                            `Invalid data for market symbol: ${marketSymbol}`
                        )
                    }

                    const key = `${this.REDIS_KEYS.PUBLIC}:${marketSymbol}`
                    pipeline.setex(key, this.TTL, JSON.stringify(data))
                }

                pipeline
                    .exec()
                    .then((results) => {
                        // pipeline.exec()은 [Error, Result][] 형태의 배열을 반환
                        const errors = results?.filter(([err]) => err) || []
                        if (errors.length > 0) {
                            reject(
                                new Error(
                                    `Redis pipeline execution failed: ${errors[0][0]}`
                                )
                            )
                        } else {
                            resolve()
                        }
                    })
                    .catch((error) => {
                        reject(
                            new Error(
                                `Failed to execute Redis pipeline: ${error.message}`
                            )
                        )
                    })
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error)
                reject(
                    new Error(`Error preparing Redis pipeline: ${errorMessage}`)
                )
            }
        })
    }

    // 거래소별 표준화된 마스터 데이터 저장
    private storeExchangeMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>,
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("전체 마스터 데이터 크기:", globalData.size)
                const pipeline = this.redis.pipeline()

                // exchangeDataMap에서 각 거래소별로 처리
                for (const [
                    exchangeKey,
                    standardizedData,
                ] of exchangeDataMap.entries()) {
                    // console.log(
                    //     `${exchangeKey} 표준화된 데이터 크기:`,
                    //     standardizedData.length
                    // )
                    // 해당 거래소의 표준화된 데이터와 전체 마스터 데이터의 교집합 찾기
                    const intersectionData =
                        this.findIntersectionWithGlobalData(
                            standardizedData,
                            globalData
                        )

                    console.log(
                        `${exchangeKey} 교집합 데이터 크기:`,
                        intersectionData.length
                    )

                    // 교집합 데이터 저장
                    for (const market of intersectionData) {
                        const redisKey = `${this.REDIS_KEYS.MASTER}:${exchangeKey}:${market.marketSymbol}`
                        const globalMarket = globalData.get(market.baseSymbol)!

                        pipeline.setex(
                            redisKey,
                            this.TTL,
                            JSON.stringify({
                                exchange: market.exchange,
                                exchangeType: market.exchangeType,
                                marketSymbol: market.marketSymbol,
                                baseSymbol: market.baseSymbol,
                                quoteSymbol: market.quoteSymbol,
                                status: market.status,
                                globalInfo: {
                                    sourceExchanges:
                                        globalMarket.additionalInfo
                                            ?.sourceExchanges,
                                    registeredAt: new Date().toISOString(),
                                },
                            })
                        )
                    }
                }

                await pipeline
                    .exec()
                    .then((results) => {
                        const errors = results?.filter(([err]) => err)
                        if (errors?.length) {
                            throw new Error(
                                `Redis pipeline execution failed: ${errors[0][0]}`
                            )
                        }
                        resolve()
                    })
                    .catch((error) => {
                        throw error
                    })
            } catch (error: any) {
                reject(
                    new Error(
                        `Error storing exchange master data: ${error.message}`
                    )
                )
            }
        })
    }

    private findIntersectionWithGlobalData(
        standardizedData: ExchangeInfo[],
        globalData: Map<string, ExchangeInfo>
    ): ExchangeInfo[] {
        // 전체 마스터 데이터와 교집합 찾기
        return standardizedData.filter((market) => {
            // 기본 조건: 전체 마스터 데이터에 해당 baseSymbol이 존재
            const globalMarket = globalData.get(market.baseSymbol)
            if (!globalMarket) return false

            // 추가 조건들
            return (
                market.status === "active" && // 활성화된 마켓만
                this.isValidQuoteSymbol(market.quoteSymbol, market.exchange) // 거래소별 적절한 기준통화 확인
            )
        })
    }

    private isValidQuoteSymbol(quoteSymbol: string, exchange: string): boolean {
        // 거래소별 기준통화 검증
        switch (exchange) {
            case "upbit":
                return ["KRW"].includes(quoteSymbol)
            case "bithumb":
            case "coinone":
                return ["KRW"].includes(quoteSymbol)
            case "binance":
                return ["USDT"].includes(quoteSymbol)
            case "bybit":
                return ["USDT"].includes(quoteSymbol)
            default:
                return false
        }
    }

    cleanup(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const patterns = [
                    `${this.REDIS_KEYS.STANDARDIZED}:*`,
                    `${this.REDIS_KEYS.MASTER}:*`,
                    `${this.REDIS_KEYS.PUBLIC}:*`,
                ]

                for (const pattern of patterns) {
                    try {
                        const keys = await this.redis.keys(pattern)
                        if (keys.length > 0) {
                            await this.redis.del(...keys).catch((error) => {
                                throw new Error(
                                    `Failed to delete keys for pattern ${pattern}: ${error.message}`
                                )
                            })
                        }
                    } catch (error: any) {
                        throw new Error(
                            `Failed to process pattern ${pattern}: ${error.message}`
                        )
                    }
                }

                resolve()
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error)
                console.error("Failed to cleanup Redis storage:", errorMessage)
                reject(new Error(`Redis cleanup failed: ${errorMessage}`))
            }
        })
    }
}
