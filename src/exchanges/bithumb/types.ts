/**
 * Path: src/exchanges/bithumb/types.ts
 */

// 구독 메시지 타입
export interface BithumbSubscription {
    type: string // "orderbookdepth"
    symbols: string[] // ["BTC_KRW"]
    tickTypes: string[] // ["1H"]
}

// 호가 데이터 타입
interface OrderBookLevel {
    price: string
    quantity: string
}

// 빗썸 호가 메시지 타입
export interface BithumbOrderBookMessage {
    type: string // "orderbookdepth"
    content: {
        symbol: string // "BTC_KRW"
        timestamp: number
        datetime: string
        asks: OrderBookLevel[]
        bids: OrderBookLevel[]
    }
}

// 빗썸 WebSocket 메시지 유니온 타입
export type BithumbRawMessage = BithumbOrderBookMessage

// 빗썸 마켓 정보 타입
export interface BithumbMarketInfo {
    symbol: string
    order_currency: string
    payment_currency: string
    min_price: string
    max_price: string
    tick_size: string
    min_order_size: string
    is_active: boolean
}

// 심볼 변환 유틸리티
export const convertBithumbSymbol = {
    toStandardSymbol: (bithumbSymbol: string): string => {
        // BTC_KRW -> BTCKRW
        return bithumbSymbol.replace("_", "")
    },
    toBithumbSymbol: (symbol: string): string => {
        // BTCKRW -> BTC_KRW
        const base = symbol.slice(0, 3)
        const quote = symbol.slice(3)
        return `${base}_${quote}`
    },
}
