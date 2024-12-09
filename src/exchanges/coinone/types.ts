/**
 * Path: src/exchanges/coinone/types.ts
 */

// 구독 메시지 타입
export interface CoinoneSubscription {
    event: "subscribe" | "unsubscribe"
    channel: string // "orderbook"
    markets: string[] // ["BTC-KRW"]
}

// 호가 데이터 타입
interface OrderBookLevel {
    price: string
    quantity: string
}

// 코인원 호가 메시지 타입
export interface CoinoneOrderBookMessage {
    type: "orderbook"
    market: string // "BTC-KRW"
    timestamp: number
    orderbook: {
        asks: OrderBookLevel[]
        bids: OrderBookLevel[]
    }
}

// 코인원 WebSocket 메시지 유니온 타입
export type CoinoneRawMessage = CoinoneOrderBookMessage

// 코인원 마켓 정보 타입
export interface CoinoneMarketInfo {
    market: string
    base_asset: string
    quote_asset: string
    status: string
    trading_status: string
    min_price: string
    max_price: string
    tick_size: string
    min_quantity: string
}

// 심볼 변환 유틸리티
export const convertCoinoneMarketCode = {
    toStandardSymbol: (marketCode: string): string => {
        // BTC-KRW -> BTCKRW
        const [base, quote] = marketCode.split("-")
        return `${base}${quote}`
    },
    toMarketCode: (symbol: string): string => {
        // BTCKRW -> BTC-KRW
        const base = symbol.slice(0, 3)
        const quote = symbol.slice(3)
        return `${base}-${quote}`
    },
}
