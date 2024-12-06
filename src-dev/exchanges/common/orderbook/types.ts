/**
 * Path: src/exchanges/common/types.ts
 * OrderBook 관련 타입 정의
 */

// 기본 가격/수량 레벨
export interface OrderBookLevel {
    price: number
    quantity: number
}

// OrderBook 스냅샷
export interface OrderBookSnapshot {
    symbol: string
    lastUpdateId: number
    bids: OrderBookLevel[]
    asks: OrderBookLevel[]
    timestamp: number
}

// OrderBook 업데이트
export interface OrderBookUpdate {
    symbol: string
    firstUpdateId: number
    finalUpdateId: number
    bids: OrderBookLevel[]
    asks: OrderBookLevel[]
    timestamp: number
}

// OrderBook 관리 인터페이스
export interface OrderBookManager {
    updateOrderBook(symbol: string, update: OrderBookUpdate): void
    getOrderBook(symbol: string): OrderBookSnapshot | undefined
    handleSnapshot?(symbol: string, snapshot: OrderBookSnapshot): void
    clear(): void
}

// OrderBook 이벤트 타입
export interface OrderBookEvent {
    symbol: string
    type: "snapshot" | "update"
    data: OrderBookSnapshot | OrderBookUpdate
}
