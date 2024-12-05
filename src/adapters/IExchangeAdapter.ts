// src/exchanges/IExchangeAdapter.ts
import { CoinInfo } from "../models/CoinInfo"
import { WebSocketConfig } from "../exchanges/WebSocketConnectionConfig"
import { OrderBook } from "../models/coin.types"

export interface SocketRequest {
    method: string // 요청 메서드 (예: "SUBSCRIBE")
    params?: string[] // 구독할 심볼 목록
    id: number // 요청 ID
}
export interface RestRequest {
    method: string // 요청 메서드 (예: "GET")
    url: string // 요청 URL
    params?: any // 요청 파라메터
}

export interface IExchangeAdapter {
    getExchangeName(): string
    getWebSocketConfig(): WebSocketConfig
    // 소켓 기능
    subscribe(coinInfos: CoinInfo[]): SocketRequest
    unsubscribe(coinInfos: CoinInfo[]): SocketRequest
    listSubscriptions(): SocketRequest
    parsingSocketMessage(data: any): any

    isBookTicker(data: any): boolean
    isOrderBook(data: any): boolean

    normalizeBookTicker(data: any): OrderBook
    normalizeOrderBook(data: any): OrderBook

    // REST API 기능
    fetchExchangeInfo(): RestRequest
    fetchOrderBook(symbol: string): RestRequest

    // 데이터 파싱
    parsingOrderBook(data: any): any
    parsingExchangeInfo(data: any): any
}
