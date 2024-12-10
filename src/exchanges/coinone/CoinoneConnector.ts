/**
 * Path: src/exchanges/coinone/CoinoneConnector.ts
 */
import axios from "axios"
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { SymbolGroup } from "../../collectors/types"
import {
    CoinoneOrderBookMessage,
    CoinoneSubscription,
    CoinoneMarketInfo,
    convertCoinoneMarketCode,
} from "./types"
import { BookTickerData, ExchangeInfo } from "../common/types"
import { CoinoneBookTickerConverter } from "./CoinoneBookTickerConverter"
import { IWebSocketManager } from "../../websocket/IWebSocketManager"
import { ExchangeConfig } from "../../config/types"

export class CoinoneConnector extends ExchangeConnector {
    static readonly BASE_URL = "https://api.coinone.co.kr/v2"
    private readonly converter: CoinoneBookTickerConverter

    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager)
        this.converter = new CoinoneBookTickerConverter()
    }

    public formatSubscriptionRequest(symbols: string[]): CoinoneSubscription {
        return {
            event: "subscribe",
            channel: "orderbook",
            markets: symbols.map((symbol) =>
                convertCoinoneMarketCode.toMarketCode(symbol)
            ),
        }
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): CoinoneSubscription {
        return {
            event: "unsubscribe",
            channel: "orderbook",
            markets: symbols.map((symbol) =>
                convertCoinoneMarketCode.toMarketCode(symbol)
            ),
        }
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as CoinoneOrderBookMessage
            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbook" &&
                "market" in msg &&
                "timestamp" in msg &&
                "orderbook" in msg &&
                Array.isArray(msg.orderbook.asks) &&
                Array.isArray(msg.orderbook.bids)
            )
        } catch {
            return false
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as CoinoneOrderBookMessage
        const bookTicker = CoinoneBookTickerConverter.convert(this.config, msg)

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
                result: string
                error_code: string
                server_time: number
                currencies: {
                    name: string
                    symbol: string
                    deposit_status: string
                    withdraw_status: string
                    deposit_confirm_count: number
                    max_precision: number
                    deposit_fee: string
                    withdrawal_min_amount: string
                    withdrawal_fee: string
                }[]
            }>("https://api.coinone.co.kr/public/v2/currencies")

            if (response.data.result !== "success") {
                throw new WebSocketError(
                    ErrorCode.API_ERROR,
                    `Coinone API error: ${response.data.error_code}`,
                    undefined,
                    ErrorSeverity.HIGH
                )
            }

            return response.data.currencies.map((currency) => ({
                exchange: "coinone",
                exchangeType: config.exchangeType,
                marketSymbol: `${currency.symbol}-KRW`,
                baseSymbol: currency.symbol,
                quoteSymbol: "KRW",
                status:
                    currency.deposit_status === "normal" &&
                    currency.withdraw_status === "normal"
                        ? "active"
                        : "inactive",
                isDepositEnabled: currency.deposit_status === "normal",
                isWithdrawalEnabled: currency.withdraw_status === "normal",
                additionalInfo: {
                    name: currency.name,
                    depositStatus: currency.deposit_status,
                    withdrawStatus: currency.withdraw_status,
                    depositConfirmCount: currency.deposit_confirm_count,
                    maxPrecision: currency.max_precision,
                    depositFee: currency.deposit_fee,
                    minWithdrawalAmount: currency.withdrawal_min_amount,
                    withdrawalFee: currency.withdrawal_fee,
                    timestamp: response.data.server_time,
                },
            }))
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Coinone API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    )
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Coinone API request failed: ${error.message}`,
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
        throw new Error("Method not implemented.")
    }

    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Coinone internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  )

        super.handleError(wsError)
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback)
    }
}
