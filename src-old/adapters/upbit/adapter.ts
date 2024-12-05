// src/adapters/upbit/adapter.ts

import WebSocket from "ws"
import {
    MarketData,
    OrderBookData,
    TradeData,
    TickerData,
    PriceLevel,
} from "../../types/data"
import {
    UpbitRawTrade,
    UpbitRawOrderBook,
    UpbitRawTicker,
    UpbitWebSocketMessage,
} from "./types"
import { Logger } from "../../utils/logger"

export class UpbitAdapter {
    private logger: Logger

    constructor() {
        this.logger = Logger.getInstance("UpbitAdapter")
    }

    normalizeSymbol(symbol: string): string {
        const [base, quote] = symbol.split("-")
        return `${quote}-${base}` // BTC-USDT -> USDT-BTC (Upbit 포맷)
    }

    denormalizeSymbol(symbol: string): string {
        const [quote, base] = symbol.split("-")
        return `${base}-${quote}` // USDT-BTC -> BTC-USDT (표준 포맷)
    }

    createSubscriptionMessage(symbols: string[]): string {
        return JSON.stringify([
            {
                ticket: `UPBIT_${Date.now()}`,
            },
            {
                type: "trade",
                codes: symbols.map(this.normalizeSymbol),
                isOnlyRealtime: true,
            },
            {
                type: "orderbook",
                codes: symbols.map(this.normalizeSymbol),
                isOnlyRealtime: true,
            },
            {
                type: "ticker",
                codes: symbols.map(this.normalizeSymbol),
                isOnlyRealtime: true,
            },
        ])
    }

    parseMessage(message: string): MarketData | null {
        try {
            const parsed: UpbitWebSocketMessage = JSON.parse(message)

            if (!parsed.type || !parsed.data) {
                this.logger.warn("Invalid message format", { message })
                return null
            }

            const data = parsed.data
            const symbol = this.denormalizeSymbol(data.code)

            switch (parsed.type) {
                case "trade":
                    return this.parseTrade(symbol, data as UpbitRawTrade)
                case "orderbook":
                    return this.parseOrderBook(
                        symbol,
                        data as UpbitRawOrderBook
                    )
                case "ticker":
                    return this.parseTicker(symbol, data as UpbitRawTicker)
                default:
                    this.logger.warn("Unknown message type", {
                        type: parsed.type,
                    })
                    return null
            }
        } catch (error) {
            this.logger.error("Message parse error", error)
            return null
        }
    }

    private parseTrade(symbol: string, data: UpbitRawTrade): MarketData {
        const trade: TradeData = {
            price: data.trade_price,
            quantity: data.trade_volume,
            side: data.ask_bid === "ASK" ? "SELL" : "BUY",
            timestamp: data.timestamp,
            tradeId: data.sequential_id.toString(),
        }

        return {
            exchangeId: "UPBIT",
            symbol,
            timestamp: data.timestamp,
            data: { trade },
            type: "TRADE",
            collectorId: "UPBIT",
        }
    }

    private parseOrderBook(
        symbol: string,
        data: UpbitRawOrderBook
    ): MarketData {
        const orderbook: OrderBookData = {
            bids: data.orderbook_units.map((unit) => ({
                price: unit.bid_price,
                quantity: unit.bid_size,
            })),
            asks: data.orderbook_units.map((unit) => ({
                price: unit.ask_price,
                quantity: unit.ask_size,
            })),
            timestamp: data.timestamp,
        }

        return {
            exchangeId: "UPBIT",
            symbol,
            timestamp: data.timestamp,
            data: { orderbook },
            type: "ORDERBOOK",
            collectorId: "UPBIT",
        }
    }

    private parseTicker(symbol: string, data: UpbitRawTicker): MarketData {
        const ticker: TickerData = {
            price: data.trade_price,
            high: data.high_price,
            low: data.low_price,
            volume: data.acc_trade_volume_24h,
            timestamp: data.timestamp,
        }

        return {
            exchangeId: "UPBIT",
            symbol,
            timestamp: data.timestamp,
            data: { ticker },
            type: "TICKER",
            collectorId: "UPBIT",
        }
    }
}
