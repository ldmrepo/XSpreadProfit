// src/utils/validators.ts

import {
    MarketData,
    ValidationResult,
    OrderBookData,
    TradeData,
    TickerData,
} from "../types/data"

export class DataValidator {
    static validateMarketData(data: MarketData): ValidationResult {
        const errors: string[] = []

        // 기본 필드 검증
        if (!data.exchangeId) errors.push("Missing exchangeId")
        if (!data.symbol) errors.push("Missing symbol")
        if (!data.timestamp) errors.push("Missing timestamp")
        if (!data.data) errors.push("Missing data")

        // 타임스탬프 검증
        if (data.timestamp > Date.now() + 5000) {
            // 5초 이상 미래의 타임스탬프는 거부
            errors.push("Invalid timestamp: future date")
        }

        // 데이터 타입별 검증
        if (data.data.orderbook) {
            const orderbookErrors = this.validateOrderBook(data.data.orderbook)
            errors.push(...orderbookErrors)
        }

        if (data.data.trade) {
            const tradeErrors = this.validateTrade(data.data.trade)
            errors.push(...tradeErrors)
        }

        if (data.data.ticker) {
            const tickerErrors = this.validateTicker(data.data.ticker)
            errors.push(...tickerErrors)
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        }
    }

    private static validateOrderBook(orderbook: OrderBookData): string[] {
        const errors: string[] = []

        if (!Array.isArray(orderbook.bids)) {
            errors.push("Invalid orderbook: bids must be an array")
        }

        if (!Array.isArray(orderbook.asks)) {
            errors.push("Invalid orderbook: asks must be an array")
        }

        // 가격 레벨 검증
        orderbook.bids.forEach((bid, index) => {
            if (
                typeof bid.price !== "number" ||
                typeof bid.quantity !== "number"
            ) {
                errors.push(`Invalid bid at index ${index}`)
            }
        })

        orderbook.asks.forEach((ask, index) => {
            if (
                typeof ask.price !== "number" ||
                typeof ask.quantity !== "number"
            ) {
                errors.push(`Invalid ask at index ${index}`)
            }
        })

        // 가격 정렬 검증
        for (let i = 1; i < orderbook.bids.length; i++) {
            if (orderbook.bids[i].price > orderbook.bids[i - 1].price) {
                errors.push("Invalid orderbook: bids not properly sorted")
                break
            }
        }

        for (let i = 1; i < orderbook.asks.length; i++) {
            if (orderbook.asks[i].price < orderbook.asks[i - 1].price) {
                errors.push("Invalid orderbook: asks not properly sorted")
                break
            }
        }

        return errors
    }

    private static validateTrade(trade: TradeData): string[] {
        const errors: string[] = []

        if (typeof trade.price !== "number")
            errors.push("Invalid trade: price must be a number")
        if (typeof trade.quantity !== "number")
            errors.push("Invalid trade: quantity must be a number")
        if (!["BUY", "SELL"].includes(trade.side))
            errors.push("Invalid trade: invalid side")
        if (!trade.timestamp) errors.push("Invalid trade: missing timestamp")

        return errors
    }

    private static validateTicker(ticker: TickerData): string[] {
        const errors: string[] = []

        if (typeof ticker.price !== "number")
            errors.push("Invalid ticker: price must be a number")
        if (typeof ticker.high !== "number")
            errors.push("Invalid ticker: high must be a number")
        if (typeof ticker.low !== "number")
            errors.push("Invalid ticker: low must be a number")
        if (typeof ticker.volume !== "number")
            errors.push("Invalid ticker: volume must be a number")
        if (!ticker.timestamp) errors.push("Invalid ticker: missing timestamp")

        if (ticker.low > ticker.high)
            errors.push("Invalid ticker: low price greater than high")
        if (ticker.price < ticker.low || ticker.price > ticker.high) {
            errors.push(
                "Invalid ticker: current price outside of high/low range"
            )
        }

        return errors
    }
}

export class ConfigValidator {
    static validateRedisConfig(config: any): ValidationResult {
        const errors: string[] = []

        if (!config.host) errors.push("Missing Redis host")
        if (!config.port) errors.push("Missing Redis port")

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        }
    }

    static validateExchangeConfig(config: any): ValidationResult {
        const errors: string[] = []

        if (!config.id) errors.push("Missing exchange ID")
        if (!config.websocketUrl) errors.push("Missing WebSocket URL")
        if (!config.symbols || !Array.isArray(config.symbols)) {
            errors.push("Invalid or missing symbols array")
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        }
    }
}
