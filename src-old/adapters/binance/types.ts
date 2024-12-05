// src/adapters/binance/types.ts

export interface BinanceRawTrade {
    e: string // 이벤트 타입
    E: number // 이벤트 시간
    s: string // 심볼
    t: number // 거래 ID
    p: string // 가격
    q: string // 수량
    b: number // 매수 주문 ID
    a: number // 매도 주문 ID
    T: number // 거래 시간
    m: boolean // 매수자가 마커인지 여부
    M: boolean // 무시
}

export interface BinanceRawOrderBook {
    e: string // 이벤트 타입
    E: number // 이벤트 시간
    s: string // 심볼
    U: number // 첫 업데이트 ID
    u: number // 마지막 업데이트 ID
    b: [string, string][] // 매수 [가격, 수량]
    a: [string, string][] // 매도 [가격, 수량]
}

export interface BinanceRawTicker {
    e: string // 이벤트 타입
    E: number // 이벤트 시간
    s: string // 심볼
    p: string // 24시간 가격 변화
    P: string // 24시간 가격 변화율
    w: string // 가중 평균 가격
    c: string // 마지막 가격
    Q: string // 마지막 수량
    o: string // 시가
    h: string // 고가
    l: string // 저가
    v: string // 거래량
    q: string // 거래대금
}

export interface BinanceWebSocketMessage {
    stream: string
    data: BinanceRawTrade | BinanceRawOrderBook | BinanceRawTicker
}
