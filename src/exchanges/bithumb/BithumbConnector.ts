/**
 * Path: src/exchanges/bithumb/BithumbConnector.ts
 */
import axios from "axios"
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { SymbolGroup } from "../../collectors/types"
import {
    BithumbOrderBookMessage,
    BithumbSubscription,
    BithumbMarketInfo,
    convertBithumbSymbol,
} from "./types"
import { BookTickerData, ExchangeInfo } from "../common/types"
import { BithumbBookTickerConverter } from "./BithumbBookTickerConverter"
import { IWebSocketManager } from "../../websocket/IWebSocketManager"

export class BithumbConnector extends ExchangeConnector {
    static readonly BASE_URL = "https://api.bithumb.com/public"

    constructor(
        id: string,
        symbols: SymbolGroup,
        wsManager: IWebSocketManager
    ) {
        super(id, symbols, wsManager)
    }

    public formatSubscriptionRequest(symbols: string[]): BithumbSubscription {
        return {
            type: "orderbookdepth",
            symbols: symbols.map((symbol) =>
                convertBithumbSymbol.toBithumbSymbol(symbol)
            ),
            tickTypes: ["1H"],
        }
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): BithumbSubscription {
        return {
            type: "orderbookdepth",
            symbols: symbols.map((symbol) =>
                convertBithumbSymbol.toBithumbSymbol(symbol)
            ),
            tickTypes: [],
        }
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as BithumbOrderBookMessage
            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbookdepth" &&
                "content" in msg &&
                "symbol" in msg.content &&
                "timestamp" in msg.content &&
                Array.isArray(msg.content.asks) &&
                Array.isArray(msg.content.bids)
            )
        } catch {
            return false
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as BithumbOrderBookMessage
        const bookTicker = BithumbBookTickerConverter.convert(msg)

        this.emit("bookTickerUpdate", bookTicker)

        return {
            type: "bookTicker",
            symbol: bookTicker.symbol,
            data: bookTicker,
        }
    }

    static async fetchExchangeInfo(): Promise<ExchangeInfo[]> {
        try {
            const response = await axios.get<{
                data: {
                    market: string
                    korean_name: string
                    english_name: string
                }[]
            }>("https://api.bithumb.com/v1/market/all")

            // console.log("response", response.data)
            // 응답 데이터 변환
            const data: any = response.data
            return data.map((item: any) => ({
                type: "spot", // 빗썸은 현물 데이터로 가정
                exchange: "bithumb",
                marketSymbol: item.market,
                baseSymbol: item.market.split("-")[1], // 기초 자산 추출
                quoteSymbol: item.market.split("-")[0], // 거래 심볼 추출
                status: "active", // 기본값
                additionalInfo: {
                    koreanName: item.korean_name,
                    englishName: item.english_name,
                    timestamp: Date.now(),
                },
            }))
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bithumb API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    )
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bithumb API request failed: ${error.message}`,
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
                      "Bithumb internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  )

        super.handleError(wsError)
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback)
    }
}
