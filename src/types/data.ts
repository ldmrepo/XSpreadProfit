// src/types/data.ts

// 원시 시장 데이터
export interface RawMarketData {
    symbol: string
    timestamp: number
    data: any
}

// 정규화된 시장 데이터
export interface MarketData {
    exchangeId: string
    symbol: string
    timestamp: number
    type?: string
    data: MarketDataContent
    collectorId: string
    sequence?: number
}
export interface standardData {
    exchange: string // 거래소 이름
    symbol: string // 심볼, 예: BTC/USDT
    exchangeType: string // 선물, 현물
    ticker: string // 거래소 심볼, 예: BTCUSDT
    timestamp: string // 타임스탬프, 밀리초 단위
    bids: [number, number][] // 매수 호가 리스트 [가격, 수량]
    asks: [number, number][] // 매도 호가 리스트 [가격, 수량]
}

// 시장 데이터 내용
export interface MarketDataContent {
    price?: number
    quantity?: number
    side?: "BUY" | "SELL"
    type?: MarketDataType
    orderbook?: OrderBookData
    trade?: TradeData
    ticker?: TickerData
}

// 주문장 데이터
export interface OrderBookData {
    bids: PriceLevel[]
    asks: PriceLevel[]
    timestamp: number
}

// 거래 데이터
export interface TradeData {
    price: number
    quantity: number
    side: "BUY" | "SELL"
    timestamp: number
    tradeId?: string
}

// 시세 데이터
export interface TickerData {
    price: number
    high: number
    low: number
    volume: number
    timestamp: number
}

// 가격 레벨
export interface PriceLevel {
    price: number
    quantity: number
}

// 처리된 데이터
export interface ProcessedData extends MarketData {
    processedAt: number
    processorId: string
    metadata?: Record<string, any>
}

// 시장 데이터 타입
export type MarketDataType = "TRADE" | "ORDERBOOK" | "TICKER" | "CANDLE"

// 데이터 검증 결과
export interface ValidationResult {
    valid: boolean
    errors?: string[]
}
