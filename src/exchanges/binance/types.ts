/**
 * Path: src/exchanges/binance/types.ts
 */
export interface BinanceBookTickerStream {
    stream: string
    data: BinanceBookTickerMessage
}
export interface BinanceBookTickerMessage {
    u: number // Order book updateId
    s: string // Symbol
    b: string // Best bid price
    B: string // Best bid qty
    a: string // Best ask price
    A: string // Best ask qty
}

export interface BinanceSubscription {
    method: "SUBSCRIBE" | "UNSUBSCRIBE"
    params: string[]
    id: number
}

export interface BinanceBookTickerData {
    symbol: string
    updateId: number
    bestBid: {
        price: number
        quantity: number
    }
    bestAsk: {
        price: number
        quantity: number
    }
    timestamp: number
}
export interface BinanceDepthMessage {
    lastUpdateId: number
    bids: [string, string][] // [price, quantity][]
    asks: [string, string][] // [price, quantity][]
}
