/**
 * Path: src/exchanges/common/types.ts
 * 거래소 공통 인터페이스
 */
import { WebSocketConfig } from "../../websocket/types"
import { OrderBookSnapshot, OrderBookUpdate } from "./orderbook/types"
import { WebSocketMessage } from "../../websocket/types"

// 거래소 설정 인터페이스
export interface ExchangeConfig {
    name: string
    wsConfig: WebSocketConfig
    symbols: string[]
    options?: Record<string, unknown>
}

// OrderBook 관련 인터페이스
export interface OrderBookCommon {
    getOrderBook(symbol: string): OrderBookSnapshot | undefined
    updateOrderBook(symbol: string, update: OrderBookUpdate): void
    clear(): void
}

// 메시지 처리 인터페이스
export interface ExchangeMessageHandler {
    handleMessage(data: unknown): WebSocketMessage
    isValidMessage(data: unknown): boolean
}

// 거래소 이벤트 인터페이스
export interface ExchangeEvents {
    message: (message: WebSocketMessage) => void
    orderBookUpdate: (data: {
        symbol: string
        orderBook: OrderBookSnapshot | undefined
    }) => void
    error: (error: Error) => void
}
