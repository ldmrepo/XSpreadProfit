/**
 * Path: src/exchanges/coinone/CoinoneConnector.ts
 */
import axios from "axios";
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { SymbolGroup } from "../../collectors/types";
import {
    CoinoneShortTickerMessage,
    CoinoneSubscription,
    CoinoneTickerMessage,
} from "./types";
import { BookTickerData, ExchangeInfo } from "../common/types";
import { CoinoneTickerConverter } from "./CoinoneBookTickerConverter";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";
import { ExchangeConfig } from "../../config/types";
import { CoinoneShortTickerConverter } from "./CoinoneShortTickerConverter";

// CoinoneSubscription 인터페이스 정의

export class CoinoneConnector extends ExchangeConnector {
    private readonly converter: CoinoneTickerConverter;

    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager);
        this.converter = new CoinoneTickerConverter();
    }
    protected pingMessage(): unknown {
        return {
            request_type: "PING",
        };
    }
    protected formatPingMessage(data?: unknown): unknown {
        return data;
    }
    public formatSubscriptionRequest(symbols: string[]): CoinoneSubscription[] {
        return symbols.map((symbol) => ({
            request_type: "SUBSCRIBE",
            channel: "TICKER",
            topic: {
                quote_currency: "KRW",
                target_currency: symbol.toUpperCase(),
            },
            format: "SHORT",
        }));
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): CoinoneSubscription[] {
        return symbols.map((symbol) => ({
            request_type: "SUBSCRIBE",
            channel: "TICKER",
            topic: {
                quote_currency: "KRW",
                target_currency: symbol.toUpperCase(),
            },
            format: "SHORT",
        }));
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as {
                r: string;
                c: string;
                d: {
                    qc: string;
                    tc: string;
                    t: number;
                    la?: string;
                    hi?: string;
                    lo?: string;
                    fi?: string;
                };
            };

            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.r === "DATA" &&
                msg.c === "TICKER" &&
                typeof msg.d === "object" &&
                "qc" in msg.d &&
                "tc" in msg.d &&
                "t" in msg.d &&
                "la" in msg.d &&
                "hi" in msg.d &&
                "lo" in msg.d &&
                "fi" in msg.d
            );
        } catch {
            return false;
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as CoinoneShortTickerMessage;
        const bookTicker = CoinoneShortTickerConverter.convert(
            this.config,
            msg
        );

        return {
            type: "bookTicker",
            exchange: this.config.exchange,
            exchangeType: this.config.exchangeType,
            symbol: bookTicker.symbol,
            data: bookTicker,
        };
    }

    static async fetchSpotExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        try {
            const response = await axios.get<{
                result: string;
                error_code: string;
                server_time: number;
                markets: {
                    quote_currency: string;
                    target_currency: string;
                    min_price: string;
                    max_price: string;
                    min_qty: string;
                    max_qty: string;
                    min_order_amount: string;
                    max_order_amount: string;
                    maintenance_status: number;
                    trade_status: number;
                }[];
            }>(`${config.url}/public/v2/markets/KRW`);

            if (response.data.result !== "success") {
                throw new WebSocketError(
                    ErrorCode.API_ERROR,
                    `Coinone API error: ${response.data.error_code}`,
                    undefined,
                    ErrorSeverity.HIGH
                );
            }

            return response.data.markets
                .filter((market) => market.trade_status === 1)
                .map((market) => ({
                    exchange: "coinone",
                    exchangeType: config.exchangeType,
                    marketSymbol: `${market.target_currency}`,
                    baseSymbol: market.target_currency,
                    quoteSymbol: market.quote_currency,
                    status: "active",
                    isDepositEnabled: market.maintenance_status === 0,
                    isWithdrawalEnabled: market.maintenance_status === 0,
                    minPrice: market.min_price,
                    maxPrice: market.max_price,
                    maxOrderQty: market.max_qty,
                    minOrderQty: market.min_qty,
                    additionalInfo: {
                        minOrderAmount: market.min_order_amount,
                        maxOrderAmount: market.max_order_amount,
                        tradeStatus: market.trade_status,
                        maintenanceStatus: market.maintenance_status,
                        timestamp: response.data.server_time,
                    },
                }));
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Coinone API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    );
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Coinone API request failed: ${error.message}`,
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

    static async fetchFuturesExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        throw new Error("Method not implemented.");
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
                  );

        super.handleError(wsError);
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }
}
