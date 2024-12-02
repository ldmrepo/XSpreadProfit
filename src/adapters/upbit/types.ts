// src/adapters/upbit/types.ts

export interface UpbitRawTrade {
    type: string // 타입
    code: string // 마켓 코드
    timestamp: number // 체결 시각
    trade_price: number // 체결 가격
    trade_volume: number // 체결량
    ask_bid: "ASK" | "BID" // 매도/매수
    sequential_id: number // 체결 번호
}

export interface UpbitRawOrderBook {
    type: string // 타입
    code: string // 마켓 코드
    timestamp: number // 호가 생성 시각
    total_ask_size: number // 호가 매도 총량
    total_bid_size: number // 호가 매수 총량
    orderbook_units: {
        // 호가 배열
        ask_price: number // 매도 가격
        bid_price: number // 매수 가격
        ask_size: number // 매도 수량
        bid_size: number // 매수 수량
    }[]
}

export interface UpbitRawTicker {
    type: string // 타입
    code: string // 마켓 코드
    timestamp: number // 타임스탬프
    trade_price: number // 현재가
    high_price: number // 고가
    low_price: number // 저가
    acc_trade_volume_24h: number // 24시간 누적 거래량
}

export interface UpbitWebSocketMessage {
    type: string
    stream_type: string
    data: UpbitRawTrade | UpbitRawOrderBook | UpbitRawTicker
}
