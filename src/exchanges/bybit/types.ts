/**
 * Path: src/exchanges/bybit/types.ts
 */

// 구독 메시지 타입
export interface BybitSubscription {
    op: "subscribe" | "unsubscribe"
    args: string[] // ["orderbook.1.BTCUSDT"]
}

// 호가 데이터 타입
interface OrderBookLevel {
    price: string
    size: string
}

// Bybit 호가 메시지 타입
export interface BybitOrderBookMessage {
    topic: string // "orderbook.1.BTCUSDT"
    type: "snapshot" | "delta"
    ts: number // timestamp
    data: {
        s: string // symbol
        b: [string, string][] // bids [price, size]
        a: [string, string][] // asks [price, size]
        u: number // update id
    }
}

// Bybit WebSocket 메시지 유니온 타입
export type BybitRawMessage = BybitOrderBookMessage

// Bybit 마켓 정보 타입
export interface BybitMarketInfo {
    symbol: string
    baseCoin: string
    quoteCoin: string
    status: string
    marginTrading: string
    lotSizeFilter: {
        basePrecision: string
        quotePrecision: string
        minOrderQty: string
        maxOrderQty: string
    }
    priceFilter: {
        tickSize: string
        minPrice: string
        maxPrice: string
    }
}

// 심볼 변환 유틸리티
export const convertBybitSymbol = {
    toStandardSymbol: (bybitSymbol: string): string => {
        // BTCUSDT -> BTCUSDT (이미 표준 형식)
        return bybitSymbol.toUpperCase()
    },
    toBybitSymbol: (symbol: string): string => {
        // BTCUSDT -> BTCUSDT
        return symbol
    },
}
