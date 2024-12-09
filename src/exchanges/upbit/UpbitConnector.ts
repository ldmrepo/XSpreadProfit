/**
 * Path: src/exchanges/upbit/UpbitConnector.ts
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { SymbolGroup } from "../../collectors/types";
import {
    UpbitOrderBookMessage,
    UpbitSubscription,
    convertUpbitMarketCode,
    UpbitMarketInfo,
} from "./types";
import { BookTickerData, ExchangeInfo } from "../common/types";
import { UpbitBookTickerConverter } from "./UpbitBookTickerConverter";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";
import axios from "axios";

export class UpbitConnector extends ExchangeConnector {
    static readonly BASE_URL = "https://api.upbit.com/v1";

    private readonly TICKET = `UPBIT_${Date.now()}`;
    private readonly converter: UpbitBookTickerConverter;

    constructor(
        id: string,
        symbols: SymbolGroup,
        wsManager: IWebSocketManager
    ) {
        super(id, symbols, wsManager);
        this.converter = new UpbitBookTickerConverter();
    }

    public formatSubscriptionRequest(symbols: string[]): UpbitSubscription {
        return {
            ticket: this.TICKET,
            type: "orderbook",
            codes: symbols.map((symbol) =>
                convertUpbitMarketCode.toMarketCode(symbol)
            ),
            format: "SIMPLE",
        };
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
        };
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as UpbitOrderBookMessage;
            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbook" &&
                "code" in msg &&
                "timestamp" in msg &&
                "orderbook_units" in msg &&
                Array.isArray(msg.orderbook_units) &&
                msg.orderbook_units.length > 0
            );
        } catch {
            return false;
        }
    }

    // UpbitConnector에서
    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as UpbitOrderBookMessage;
        const bookTicker = UpbitBookTickerConverter.convert(msg);

        this.emit("bookTickerUpdate", bookTicker);

        return {
            type: "bookTicker",
            symbol: bookTicker.symbol,
            data: bookTicker,
        };
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
                  );

        super.handleError(wsError);
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }
    static async fetchSpotExchangeInfo(): Promise<ExchangeInfo[]> {
        try {
            // 마켓 코드 조회
            const response = await axios.get<UpbitMarketInfo[]>(
                `https://api.upbit.com/v1/market/all?isDetails=true`
            );

            return response.data
                .filter((market) => market.market.startsWith("KRW-")) // KRW 마켓만 필터링
                .map((market) => {
                    const [quote, base] = market.market.split("-");
                    return {
                        marketSymbol: market.market,
                        baseSymbol: base,
                        quoteSymbol: quote,
                        type: "spot",
                        exchange: "upbit",
                        status:
                            market.market_warning === "NONE" &&
                            market.state === "active"
                                ? "active"
                                : "inactive",
                        additionalInfo: {
                            exchange: "upbit",
                            koreanName: market.korean_name,
                            englishName: market.english_name,
                            warning: market.market_warning,
                            bidFee: market.bid_fee,
                            askFee: market.ask_fee,
                            maxTotal: market.max_total,
                            timestamp: Date.now(),
                        },
                    };
                });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Upbit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    );
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Upbit API request failed: ${error.message}`,
                    error,
                    ErrorSeverity.HIGH
                );
            }
            throw new WebSocketError(
                ErrorCode.API_ERROR,
                "Unknown API error occurred",
                error as Error,
                ErrorSeverity.HIGH
            );
        }
    }
}
