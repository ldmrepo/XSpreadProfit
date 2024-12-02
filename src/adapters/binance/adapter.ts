// src/adapters/binance/adapter.ts

import WebSocket from "ws"
import {
    MarketData,
    OrderBookData,
    TradeData,
    TickerData,
    PriceLevel,
} from "../../types/data"
import {
    BinanceRawTrade,
    BinanceRawOrderBook,
    BinanceRawTicker,
    BinanceWebSocketMessage,
} from "./types"
import { Logger } from "../../utils/logger"

export class BinanceAdapter {
    private logger: Logger

    constructor() {
        this.logger = Logger.getInstance("BinanceAdapter")
    }

    normalizeSymbol(symbol: string): string {
        return symbol.replace("-", "") // BTC-USDT -> BTCUSDT
    }

    denormalizeSymbol(symbol: string): string {
        return `${symbol.slice(0, -4)}-${symbol.slice(-4)}` // BTCUSDT -> BTC-USDT
    }

    createSubscriptionMessage(symbols: string[]): string {
        const streams = symbols.flatMap((symbol) => {
            const normalizedSymbol = this.normalizeSymbol(symbol).toLowerCase()
            return [
                `${normalizedSymbol}@trade`,
                `${normalizedSymbol}@depth20`,
                `${normalizedSymbol}@ticker`,
            ]
        })

        return JSON.stringify({
            method: "SUBSCRIBE",
            params: streams,
            id: Date.now(),
        })
    }

    parseMessage(message: string): MarketData | null {
        try {
            const parsed: BinanceWebSocketMessage = JSON.parse(message)

            if (!parsed.stream || !parsed.data) {
                this.logger.warn("Invalid message format", { message })
                return null
            }

            const [symbol, channel] = parsed.stream.split("@")
            const denormalizedSymbol = this.denormalizeSymbol(
                symbol.toUpperCase()
            )

            switch (channel) {
                case "trade":
                    return this.parseTrade(
                        denormalizedSymbol,
                        parsed.data as BinanceRawTrade
                    )
                case "depth20":
                    return this.parseOrderBook(
                        denormalizedSymbol,
                        parsed.data as BinanceRawOrderBook
                    )
                case "ticker":
                    return this.parseTicker(
                        denormalizedSymbol,
                        parsed.data as BinanceRawTicker
                    )
                default:
                    this.logger.warn("Unknown channel", { channel })
                    return null
            }
        } catch (error) {
            this.logger.error("Message parse error", error)
            return null
        }
    }

    private parseTrade(symbol: string, data: BinanceRawTrade): MarketData {
        const trade: TradeData = {
            price: parseFloat(data.p),
            quantity: parseFloat(data.q),
            side: data.m ? "SELL" : "BUY",
            timestamp: data.T,
            tradeId: data.t.toString(),
        }

        return {
            exchangeId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { trade },
            type: "TRADE",
            collectorId: "BINANCE",
        }
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
        }

        return {
            exchangeId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { orderbook },
            type: "ORDERBOOK",
            collectorId: "BINANCE",
        }
    }

    private parseTicker(symbol: string, data: BinanceRawTicker): MarketData {
        const ticker: TickerData = {
            price: parseFloat(data.c),
            high: parseFloat(data.h),
            low: parseFloat(data.l),
            volume: parseFloat(data.v),
            timestamp: data.E,
        }

        return {
            exchangeId: "BINANCE",
            collectorId: "BINANCE",
            symbol,
            timestamp: data.E,
            data: { ticker },
            type: "TICKER",
        }
    }
}
