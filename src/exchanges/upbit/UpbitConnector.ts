/**
 * Path: src/exchanges/upbit/UpbitConnector.ts
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { SymbolGroup } from "../../collectors/types"
import {
    UpbitOrderBookMessage,
    UpbitSubscription,
    convertUpbitMarketCode,
    UpbitMarketInfo,
} from "./types"
import { BookTickerData, ExchangeInfo } from "../common/types"
import { UpbitBookTickerConverter } from "./UpbitBookTickerConverter"
import { IWebSocketManager } from "../../websocket/IWebSocketManager"
import axios from "axios"
import { ExchangeConfig } from "../../config/types"

interface UpbitTickSizeInfo {
    market: string // 마켓 심볼 (예: KRW-BTC)
    min_price: string // 최소 주문 가격
    max_price: string // 최대 주문 가격
    min_trade_volume: string // 최소 주문 수량
    max_trade_volume: string // 최대 주문 수량
}

export class UpbitConnector extends ExchangeConnector {
    private readonly TICKET = `UPBIT_${Date.now()}`
    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager)
    }

    public formatSubscriptionRequest(symbols: string[]): UpbitSubscription {
        return {
            ticket: this.TICKET,
            type: "orderbook",
            codes: symbols.map((symbol) =>
                convertUpbitMarketCode.toMarketCode(symbol)
            ),
            format: "SIMPLE",
        }
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): UpbitSubscription {
        return {
            ticket: this.TICKET,
            type: "orderbook",
            codes: symbols.map((symbol) =>
                convertUpbitMarketCode.toMarketCode(symbol)
            ),
        }
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as UpbitOrderBookMessage
            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbook" &&
                "code" in msg &&
                "timestamp" in msg &&
                "orderbook_units" in msg &&
                Array.isArray(msg.orderbook_units) &&
                msg.orderbook_units.length > 0
            )
        } catch {
            return false
        }
    }

    // UpbitConnector에서
    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as UpbitOrderBookMessage
        const bookTicker = UpbitBookTickerConverter.convert(this.config, msg)

        this.emit("bookTickerUpdate", bookTicker)

        return {
            type: "bookTicker",
            exchange: this.config.exchange,
            exchangeType: this.config.exchangeType,
            symbol: bookTicker.symbol,
            data: bookTicker,
        }
    }

    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Upbit internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  )

        super.handleError(wsError)
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback)
    }
    static async fetchSpotExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        try {
            // 마켓 코드 조회
            const response = await axios.get<
                {
                    market: string
                    korean_name: string
                    english_name: string
                    market_event?: {
                        warning?: boolean
                        caution?: {
                            PRICE_FLUCTUATIONS?: boolean
                            TRADING_VOLUME_SOARING?: boolean
                            DEPOSIT_AMOUNT_SOARING?: boolean
                            GLOBAL_PRICE_DIFFERENCES?: boolean
                            CONCENTRATION_OF_SMALL_ACCOUNTS?: boolean
                        }
                    }
                }[]
            >(`${config.url}/v1/market/all?isDetails=true`)

            return response.data
                .filter((market) => market.market.startsWith("KRW-")) // KRW 마켓만 필터링
                .map((market) => {
                    const [quote, base] = market.market.split("-")

                    // 경고 및 주의 상태 파악
                    const isMarketWarning =
                        market.market_event?.warning === true
                    const isMarketCaution = Object.values(
                        market.market_event?.caution || {}
                    ).some((value) => value === true)

                    return {
                        exchange: "upbit",
                        exchangeType: config.exchangeType,
                        marketSymbol: market.market,
                        baseSymbol: base,
                        quoteSymbol: quote,
                        status: "active",
                        isDepositEnabled: true, // 업비트는 입금 상태 정보 제공 안 함
                        isWithdrawalEnabled: true, // 업비트는 출금 상태 정보 제공 안 함
                        minPrice: "0", // Tick Size 정보를 제공하지 않음
                        maxPrice: "0", // Tick Size 정보를 제공하지 않음
                        minOrderQty: "0", // 주문 단위 정보를 제공하지 않음
                        maxOrderQty: "0", // 주문 단위 정보를 제공하지 않음
                        additionalInfo: {
                            koreanName: market.korean_name,
                            englishName: market.english_name,
                            warning: isMarketWarning,
                            cautionDetails: market.market_event?.caution || {},
                            timestamp: Date.now(),
                        },
                    }
                })
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Upbit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    )
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Upbit API request failed: ${error.message}`,
                    error,
                    ErrorSeverity.HIGH
                )
            }
            throw new WebSocketError(
                ErrorCode.API_ERROR,
                "Unknown API error occurred",
                error as Error,
                ErrorSeverity.HIGH
            )
        }
    }

    static async fetchFuturesExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        throw new Error("Upbit does not support future trading")
    }
}
