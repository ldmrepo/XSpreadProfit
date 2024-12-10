/**
 * Path: src/exchanges/bybit/BybitConnector.ts
 */
import axios from "axios"
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { SymbolGroup } from "../../collectors/types"
import {
    BybitOrderBookMessage,
    BybitSubscription,
    BybitMarketInfo,
    convertBybitSymbol,
} from "./types"
import { BookTickerData, ExchangeInfo } from "../common/types"
import { BybitBookTickerConverter } from "./BybitBookTickerConverter"
import { IWebSocketManager } from "../../websocket/IWebSocketManager"
import { ExchangeConfig } from "../../config/types"

export class BybitConnector extends ExchangeConnector {
    static readonly BASE_URL = "https://api.bybit.com/v5"

    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager)
    }

    public formatSubscriptionRequest(symbols: string[]): BybitSubscription {
        return {
            op: "subscribe",
            args: symbols.map(
                (symbol) =>
                    `orderbook.1.${convertBybitSymbol.toBybitSymbol(symbol)}`
            ),
        }
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): BybitSubscription {
        return {
            op: "unsubscribe",
            args: symbols.map(
                (symbol) =>
                    `orderbook.1.${convertBybitSymbol.toBybitSymbol(symbol)}`
            ),
        }
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as BybitOrderBookMessage
            return (
                typeof msg === "object" &&
                msg !== null &&
                "topic" in msg &&
                "data" in msg &&
                Array.isArray(msg.data.b) &&
                Array.isArray(msg.data.a)
            )
        } catch {
            return false
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as BybitOrderBookMessage
        const bookTicker = BybitBookTickerConverter.convert(this.config, msg)

        this.emit("bookTickerUpdate", bookTicker)

        return {
            type: "bookTicker",
            exchange: this.config.exchange,
            exchangeType: this.config.exchangeType,
            symbol: bookTicker.symbol,
            data: bookTicker,
        }
    }

    static async fetchSpotExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        try {
            const response = await axios.get<{
                result: {
                    list: BybitMarketInfo[]
                }
            }>(`https://api.bybit.com/v5/market/instruments-info?category=spot`)

            return response.data.result.list.map((market) => ({
                exchange: "bybit",
                exchangeType: config.exchangeType,
                marketSymbol: market.symbol,
                baseSymbol: market.baseCoin,
                quoteSymbol: market.quoteCoin,
                status: market.status.toLowerCase(),
                additionalInfo: {
                    marginTrading: market.marginTrading,
                    lotSizeFilter: market.lotSizeFilter,
                    priceFilter: market.priceFilter,
                    timestamp: Date.now(),
                },
            }))
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bybit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    )
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bybit API request failed: ${error.message}`,
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
        try {
            const response = await axios.get<{
                result: {
                    list: BybitMarketInfo[]
                }
            }>(
                `${BybitConnector.BASE_URL}/market/instruments-info?category=linear`
            )

            return response.data.result.list.map((market) => ({
                exchange: "bybit",
                exchangeType: config.exchangeType,
                marketSymbol: market.symbol,
                baseSymbol: market.baseCoin,
                quoteSymbol: market.quoteCoin,
                status: market.status.toLowerCase(),
                additionalInfo: {
                    // contractType: market.contractType,
                    priceFilter: market.priceFilter,
                    lotSizeFilter: market.lotSizeFilter,
                    timestamp: Date.now(),
                },
            }))
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bybit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    )
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bybit API request failed: ${error.message}`,
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
    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Bybit internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  )

        super.handleError(wsError)
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback)
    }
}
