/**
 * Path: src/exchanges/binance/types.ts
 * 바이낸스 메시지 타입 확장
 */
export interface BinanceRawMessage {
    e: string // 이벤트 타입
    s: string // 심볼
    E: number // 이벤트 시간
    t: number // 거래 ID
    p: string // 가격
    q: string // 수량
    T: number // 거래 시간
}

export interface BinanceSubscription {
    method: "SUBSCRIBE" | "UNSUBSCRIBE"
    params: string[]
    id: number
}

export interface BinanceBaseMessage {
    e: string // 이벤트 타입
    E: number // 이벤트 시간
    s: string // 심볼
}

export interface BinanceTradeMessage extends BinanceBaseMessage {
    t: number // 거래 ID
    p: string // 가격
    q: string // 수량
    T: number // 거래 시간
}

export interface BinanceBookTickerMessage extends BinanceBaseMessage {
    b: string // 최선 매수가
    B: string // 최선 매수 수량
    a: string // 최선 매도가
    A: string // 최선 매도 수량
}

export interface BinanceOrderBookMessage extends BinanceBaseMessage {
    U: number // 첫 업데이트 ID
    u: number // 마지막 업데이트 ID
    b: [string, string][] // 매수 [가격, 수량]
    a: [string, string][] // 매도 [가격, 수량]
}
