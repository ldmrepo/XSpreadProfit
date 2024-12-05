/**
 * File: src/exchange/IExchangeAdapter.ts
 * Description: 거래소 어댑터 인터페이스 - WebSocket 및 REST API 메시지 포맷 정의
 */

import { OrderBook, CollectState } from "../types/coin.types"
import { CoinInfo } from "../models/CoinInfo"
export interface RestApiRequest {
    readonly url: string
    readonly method: "GET" | "POST"
    readonly headers?: Record<string, string>
    readonly params?: Record<string, string>
    readonly data?: unknown
}

export interface IExchangeAdapter {
    // WebSocket 메시지 포맷
    formatSubscribeMessage(symbols: string[]): string
    formatUnsubscribeMessage(symbols: string[]): string
    formatPingMessage(): string

    // WebSocket 메시지 파싱
    parseMessage(data: string): {
        symbol: string
        orderBook?: OrderBook
        collectState?: CollectState
        error?: string
    } | null

    // REST API 요청 포맷
    formatOrderBookRequest(symbol: string): RestApiRequest
    formatTickerRequest(symbols: string[]): RestApiRequest
    formatTradesRequest(symbol: string, limit?: number): RestApiRequest
    formatKlineRequest(
        symbol: string,
        interval: string,
        limit?: number
    ): RestApiRequest
}
