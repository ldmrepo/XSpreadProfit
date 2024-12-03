/**
 * src/adapters/binance/BinanceAdapter.ts
 *
 * Binance Exchange Adapter
 * - Binance WebSocket API 연동
 * - 바이낸스 특화 메시지 파싱 및 변환
 * - 심볼 포맷 정규화
 */

import WebSocket from "ws";
import {
    MarketData,
    OrderBookData,
    TradeData,
    TickerData,
} from "../../types/data";
import {
    BinanceRawTrade,
    BinanceRawOrderBook,
    BinanceRawTicker,
    BinanceWebSocketMessage,
} from "./types";
import { WebSocketConfig } from "../../types/config";
import { ExchangeInfo } from "../../types/exchange";
import { ExchangeAdapterInterface } from "../../interfaces/ExchangeAdapterInterface";
import { Logger } from "../../utils/logger";

export class BinanceAdapter implements ExchangeAdapterInterface {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance("BinanceAdapter");
    }

    normalizeSymbol(symbol: string): string {
        return symbol.replace("-", "");
    }

    denormalizeSymbol(symbol: string): string {
        return `${symbol.slice(0, -4)}-${symbol.slice(-4)}`;
    }

    createSubscriptionMessage(symbols: string[]): string {
        const streams = symbols.flatMap((symbol) => {
            const normalizedSymbol = this.normalizeSymbol(symbol).toLowerCase();
            return [
                `${normalizedSymbol}@trade`,
                `${normalizedSymbol}@depth20`,
                `${normalizedSymbol}@ticker`,
            ];
        });

        return JSON.stringify({
            method: "SUBSCRIBE",
            params: streams,
            id: Date.now(),
        });
    }

    createUnsubscriptionMessage(symbols: string[]): string {
        const streams = symbols.flatMap((symbol) => {
            const normalizedSymbol = this.normalizeSymbol(symbol).toLowerCase();
            return [
                `${normalizedSymbol}@trade`,
                `${normalizedSymbol}@depth20`,
                `${normalizedSymbol}@ticker`,
            ];
        });

        return JSON.stringify({
            method: "UNSUBSCRIBE",
            params: streams,
            id: Date.now(),
        });
    }

    validateMessage(message: string): boolean {
        try {
            const parsed = JSON.parse(message);
            return parsed.stream && parsed.data;
        } catch {
            return false;
        }
    }

    parseMessage(message: string): MarketData | null {
        if (!this.validateMessage(message)) {
            return null;
        }

        try {
            const parsed: BinanceWebSocketMessage = JSON.parse(message);
            const [symbol, channel] = parsed.stream.split("@");
            const denormalizedSymbol = this.denormalizeSymbol(
                symbol.toUpperCase()
            );

            switch (channel) {
                case "trade":
                    return this.parseTrade(
                        denormalizedSymbol,
                        parsed.data as BinanceRawTrade
                    );
                case "depth20":
                    return this.parseOrderBook(
                        denormalizedSymbol,
                        parsed.data as BinanceRawOrderBook
                    );
                case "ticker":
                    return this.parseTicker(
                        denormalizedSymbol,
                        parsed.data as BinanceRawTicker
                    );
                default:
                    this.logger.warn("Unknown channel", { channel });
                    return null;
            }
        } catch (error) {
            this.logger.error("Message parse error", error);
            return null;
        }
    }

    getWebSocketConfig(): WebSocketConfig {
        return {
            url: "wss://stream.binance.com:9443/ws",
            reconnectInterval: 1000,
            pingInterval: 30000,
            pongTimeout: 5000,
            maxReconnectAttempts: 5,
            options: {
                handshakeTimeout: 10000,
                pingInterval: 30000,
                pingTimeout: 5000,
            },
        };
    }

    getExchangeInfo(): ExchangeInfo {
        return {
            id: "BINANCE",
            name: "Binance",
            description: "Binance Spot Exchange",
            features: ["trade", "orderbook", "ticker"],
            rateLimit: {
                maxConnections: 5,
                messagePerSecond: 100,
            },
        };
    }

    private parseTrade(symbol: string, data: BinanceRawTrade): MarketData {
        const trade: TradeData = {
            price: parseFloat(data.p),
            quantity: parseFloat(data.q),
            side: data.m ? "SELL" : "BUY",
            timestamp: data.T,
            tradeId: data.t.toString(),
        };

        return {
            exchangeId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { trade },
            type: "TRADE",
            collectorId: "BINANCE",
        };
    }

    private parseOrderBook(
        symbol: string,
        data: BinanceRawOrderBook
    ): MarketData {
        const orderbook: OrderBookData = {
            bids: data.b.map(([price, quantity]) => ({
                price: parseFloat(price),
                quantity: parseFloat(quantity),
            })),
            asks: data.a.map(([price, quantity]) => ({
                price: parseFloat(price),
                quantity: parseFloat(quantity),
            })),
            timestamp: data.E,
        };

        return {
            exchangeId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { orderbook },
            type: "ORDERBOOK",
            collectorId: "BINANCE",
        };
    }

    private parseTicker(symbol: string, data: BinanceRawTicker): MarketData {
        const ticker: TickerData = {
            price: parseFloat(data.c),
            high: parseFloat(data.h),
            low: parseFloat(data.l),
            volume: parseFloat(data.v),
            timestamp: data.E,
        };

        return {
            exchangeId: "BINANCE",
            collectorId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { ticker },
            type: "TICKER",
        };
    }
}
