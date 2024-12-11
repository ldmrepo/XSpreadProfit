/**
 * Path: src/exchanges/bybit/BybitConnector.ts
 */
import axios from "axios";
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { SymbolGroup } from "../../collectors/types";
import {
    BybitOrderBookMessage,
    BybitSubscription,
    BybitMarketInfo,
    convertBybitSymbol,
} from "./types";
import { BookTickerData, ExchangeInfo } from "../common/types";
import { BybitBookTickerConverter } from "./BybitBookTickerConverter";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";
import { ExchangeConfig } from "../../config/types";
import { splitIntoBatches } from "../../utils/common";
export class BybitConnector extends ExchangeConnector {
    protected pingMessage(): unknown {
        return { req_id: "ping", op: "ping" };
    }
    protected formatPingMessage(data?: unknown): unknown {
        throw "";
    }
    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager);
    }

    public formatSubscriptionRequest(symbols: string[]): BybitSubscription[] {
        // 10개 이상의 심볼을 한번에 구독할 수 없음
        // 10 개로 나누어서 요청
        const topicBatches = splitIntoBatches(symbols, 10);
        return topicBatches.map((topicBatch, index) => {
            return {
                req_id: `subscribe_batch_${index + 1}`,
                op: "subscribe",
                args: topicBatch.map((symbol) => `orderbook.1.${symbol}`),
            };
        });
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
        };
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as BybitOrderBookMessage;
            return (
                typeof msg === "object" &&
                msg !== null &&
                "topic" in msg &&
                "data" in msg &&
                Array.isArray(msg.data.b) &&
                Array.isArray(msg.data.a)
            );
        } catch {
            return false;
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as BybitOrderBookMessage;
        const bookTicker = BybitBookTickerConverter.convert(this.config, msg);

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
                result: {
                    list: BybitMarketInfo[];
                };
            }>(
                `${config.url}/v5/market/instruments-info?category=spot&baseCoin=USDT`
            );
            return response.data.result.list
                .filter((market) => market.status.toLowerCase() === "trading")
                .map((market) => ({
                    exchange: "bybit",
                    exchangeType: config.exchangeType,
                    marketSymbol: market.symbol,
                    baseSymbol: market.baseCoin,
                    quoteSymbol: market.quoteCoin,
                    // 추가된 필드
                    minPrice: market.priceFilter.minPrice, // 최소 가격 ex)  "minPrice": "0.01" -> 0.01 USDT
                    maxPrice: market.priceFilter.maxPrice, // 최대 가격 ex)  "maxPrice": "1000000" -> 1000000 USDT
                    maxOrderQty: market.lotSizeFilter.maxOrderQty, // 최대 주문 수량 ex)  "maxOrderQty": "1000000" -> 1000000
                    minOrderQty: market.lotSizeFilter.minOrderQty, // 최소 주문 수량 ex)  "minOrderQty": "0.0001" -> 0.0001
                    status: "active",
                    additionalInfo: {
                        marginTrading: market.marginTrading,
                        lotSizeFilter: market.lotSizeFilter,
                        priceFilter: market.priceFilter,
                        timestamp: Date.now(),
                    },
                }));
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bybit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    );
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bybit API request failed: ${error.message}`,
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
        try {
            const response = await axios.get<{
                result: {
                    list: BybitMarketInfo[];
                };
            }>(`${config.url}/v5/market/instruments-info?category=linear`); // 무기한 선물 = linear

            console.log("fetchFuturesExchangeInfo");

            return response.data.result.list
                .filter((market) => market.quoteCoin.toLowerCase() === "usdt")
                .filter((market) => market.status.toLowerCase() === "trading")
                .map((market) => ({
                    exchange: "bybit",
                    exchangeType: config.exchangeType,
                    marketSymbol: market.symbol,
                    baseSymbol: market.baseCoin,
                    quoteSymbol: market.quoteCoin,
                    status: "active",
                    minPrice: market.priceFilter.minPrice,
                    maxPrice: market.priceFilter.maxPrice,
                    maxOrderQty: market.lotSizeFilter.maxOrderQty,
                    minOrderQty: market.lotSizeFilter.minOrderQty,
                    additionalInfo: {
                        // contractType: market.contractType,
                        priceFilter: market.priceFilter,
                        lotSizeFilter: market.lotSizeFilter,
                        timestamp: Date.now(),
                    },
                }));
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bybit API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    );
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bybit API request failed: ${error.message}`,
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
    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Bybit internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  );

        super.handleError(wsError);
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }
}
