/**
 * Path: src/exchanges/binance/BinanceConnector.ts
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { SymbolGroup } from "../../collectors/types"
import { BinanceBookTickerMessage, BinanceSubscription } from "./types"
import { BinanceBookTickerConverter } from "./BinanceBookTickerConverter"
import { BookTickerData, ExchangeInfo } from "../common/types"
import { IWebSocketManager } from "../../websocket/IWebSocketManager"
import axios from "axios"
import { ExchangeConfig } from "../../config/types"
// 공통 필터 타입 정의
interface PriceFilter {
    filterType: "PRICE_FILTER"
    minPrice: string
    maxPrice: string
    tickSize: string
}

interface LotSizeFilter {
    filterType: "LOT_SIZE"
    minQty: string
    maxQty: string
    stepSize: string
}

type Filter = PriceFilter | LotSizeFilter

interface BinanceSpotInfo {
    isDepositEnabled: boolean
    isWithdrawalEnabled: boolean
    symbol: string
    baseAsset: string
    quoteAsset: string
    status: string
    filters: Filter[]
}

interface BinanceFuturesInfo {
    symbol: string
    baseAsset: string
    quoteAsset: string
    status: string
    contractType: string
    filters: Filter[]
}

function isPriceFilter(filter: unknown): filter is PriceFilter {
    return (
        typeof filter === "object" &&
        filter !== null &&
        (filter as any).filterType === "PRICE_FILTER"
    )
}

function isLotSizeFilter(filter: unknown): filter is LotSizeFilter {
    return (
        typeof filter === "object" &&
        filter !== null &&
        (filter as any).filterType === "LOT_SIZE"
    )
}
// 공통 데이터 매핑 함수
function mapExchangeInfo(
    symbol: BinanceSpotInfo | BinanceFuturesInfo,
    exchange: string,
    exchangeType: string
): ExchangeInfo {
    const priceFilter = symbol.filters.find(
        (filter): filter is PriceFilter => filter.filterType === "PRICE_FILTER"
    )

    const lotSizeFilter = symbol.filters.find(
        (filter): filter is LotSizeFilter => filter.filterType === "LOT_SIZE"
    )

    return {
        exchange,
        exchangeType,
        marketSymbol: symbol.symbol,
        baseSymbol: symbol.baseAsset,
        quoteSymbol: symbol.quoteAsset,
        status:
            symbol.status.toLowerCase() === "trading" ? "active" : "inactive",
        isDepositEnabled: true, //엔드포인트: GET /sapi/v1/capital/config/getall 인증 필요
        isWithdrawalEnabled: true, //엔드포인트: GET /sapi/v1/capital/config/getall 인증 필요
        minPrice: priceFilter?.minPrice || "0",
        maxPrice: priceFilter?.maxPrice || "0",
        maxOrderQty: lotSizeFilter?.maxQty || "0",
        minOrderQty: lotSizeFilter?.minQty || "0",
        additionalInfo: {
            contractType:
                (symbol as BinanceFuturesInfo).contractType || undefined,
        },
    }
}

export class BinanceConnector extends ExchangeConnector {
    private readonly RATE_LIMIT_PER_SECOND = 5
    private lastRequestTime: number = 0
    private requestCount: number = 0

    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager)
    }

    private async checkRateLimit(): Promise<void> {
        const now = Date.now()
        const elapsedTime = now - this.lastRequestTime

        if (elapsedTime < 1000) {
            this.requestCount++
            if (this.requestCount >= this.RATE_LIMIT_PER_SECOND) {
                const waitTime = 1000 - elapsedTime
                await new Promise((resolve) => setTimeout(resolve, waitTime))
                this.requestCount = 0
                this.lastRequestTime = Date.now()
            }
        } else {
            this.requestCount = 1
            this.lastRequestTime = now
        }
    }

    public formatSubscriptionRequest(symbols: string[]): BinanceSubscription {
        const params = symbols.flatMap((symbol) => [
            `${symbol.toLowerCase()}@bookTicker`,
            `${symbol.toLowerCase()}@depth10@100ms`, // 설정에 따라 depth level과 속도 조정 가능
        ])

        return {
            method: "SUBSCRIBE",
            params,
            id: Date.now(),
        }
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): BinanceSubscription {
        const params = symbols.flatMap((symbol) => [
            `${symbol.toLowerCase()}@bookTicker`,
            `${symbol.toLowerCase()}@depth20@100ms`,
        ])

        return {
            method: "UNSUBSCRIBE",
            params,
            id: Date.now(),
        }
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as BinanceBookTickerMessage
            return (
                typeof msg === "object" &&
                msg !== null &&
                "u" in msg && // updateId
                "s" in msg && // symbol
                "b" in msg && // bid price
                "B" in msg && // bid qty
                "a" in msg && // ask price
                "A" in msg // ask qty
            )
        } catch {
            return false
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        try {
            const msg = data as BinanceBookTickerMessage
            // 바로 표준 형식으로 변환
            const standardizedData = BinanceBookTickerConverter.convert(
                this.config,
                msg
            )

            // 변환된 표준 데이터를 이벤트로 발생
            this.emit("bookTickerUpdate", standardizedData)

            return {
                type: "bookTicker",
                exchange: this.config.exchange,
                exchangeType: this.config.exchange,
                symbol: standardizedData.symbol,
                data: standardizedData,
            }
        } catch (error) {
            throw new WebSocketError(
                ErrorCode.MESSAGE_PARSE_ERROR,
                "Failed to parse Binance message",
                error as Error
            )
        }
    }

    // 추가: Book Ticker 데이터 변경 이벤트 리스너
    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback)
    }

    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Binance internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  )

        super.handleError(wsError)
    }

    // Spot Exchange Info Fetcher
    static fetchSpotExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        if (!config?.url) {
            return Promise.reject(new Error("Invalid config: url is required"))
        }
        return axios
            .get<{ symbols: BinanceSpotInfo[] }>(
                `${config.url}/api/v3/exchangeInfo`
            )
            .then(({ data }) => {
                if (!data?.symbols?.length) {
                    throw new Error("Invalid response format from Binance API")
                }
                return data.symbols
                    .filter((symbol) => symbol?.quoteAsset === "USDT")
                    .filter((symbol) => symbol?.status === "TRADING")
                    .map((symbol) =>
                        mapExchangeInfo(symbol, "binance", config.exchangeType)
                    )
            })
            .catch((error) => {
                const errorMsg = `Failed to fetch Binance spot markets: ${error.message}`
                console.error(errorMsg)
                throw new Error(errorMsg)
            })
    }

    // Futures Exchange Info Fetcher
    static fetchFuturesExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        if (!config?.url) {
            return Promise.reject(new Error("Invalid config: url is required"))
        }
        return axios
            .get<{ symbols: BinanceFuturesInfo[] }>(
                `${config.url}/fapi/v1/exchangeInfo`
            )
            .then(({ data }) => {
                if (!data?.symbols?.length) {
                    throw new Error("Invalid response format from Binance API")
                }
                return data.symbols
                    .filter((symbol) => symbol?.quoteAsset === "USDT")
                    .filter((symbol) => symbol?.status === "TRADING")
                    .map((symbol) =>
                        mapExchangeInfo(symbol, "binance", config.exchangeType)
                    )
            })
            .catch((error) => {
                const errorMsg = `Failed to fetch Binance futures markets: ${error.message}`
                console.error(errorMsg)
                throw new Error(errorMsg)
            })
    }
}
