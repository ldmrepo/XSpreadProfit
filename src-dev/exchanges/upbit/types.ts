/**
 * Path: src/exchanges/upbit/types.ts
 * 업비트 메시지 타입 정의
 */
export interface UpbitRawMessage {
    type: string
    code: string // market code (KRW-BTC)
    timestamp: number
    trade_price?: number
    trade_volume?: number
    ask_bid?: string
    sequence?: number
}

export interface UpbitSubscription {
    ticket: string
    type: string[]
    codes: string[]
}

export interface UpbitOrderbookUnit {
    ask_price: number
    bid_price: number
    ask_size: number
    bid_size: number
}

export interface UpbitOrderbookMessage extends UpbitRawMessage {
    orderbook_units: UpbitOrderbookUnit[]
    total_ask_size: number
    total_bid_size: number
}
