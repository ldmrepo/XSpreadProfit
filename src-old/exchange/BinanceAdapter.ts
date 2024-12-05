/**
 * File: src/exchange/BinanceAdapter.ts
 * Description: 바이낸스 거래소 어댑터 구현
 */

import { OrderBook, CollectState } from "../types/coin.types"
import { CoinInfo } from "../models/CoinInfo"
import { IExchangeAdapter, RestApiRequest } from "./IExchangeAdapter"

export class BinanceAdapter implements IExchangeAdapter {
    private readonly baseUrl = "https://api.binance.com"
    private lastUpdateIds: Map<string, number> = new Map()

    // WebSocket 메시지 포맷팅
    public formatSubscribeMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "SUBSCRIBE",
            params: symbols.map((symbol) => `${symbol.toLowerCase()}@depth`),
            id: Date.now(),
        })
    }

    public formatUnsubscribeMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "UNSUBSCRIBE",
            params: symbols.map((symbol) => `${symbol.toLowerCase()}@depth`),
            id: Date.now(),
        })
    }

    public formatPingMessage(): string {
        return JSON.stringify({ method: "ping" })
    }

    // WebSocket 메시지 파싱
    public parseMessage(data: string): {
        symbol: string
        orderBook?: OrderBook
        collectState?: CollectState
        error?: string
    } | null {
        try {
            const message = JSON.parse(data)

            // 구독 응답 처리
            if (message.result !== undefined) {
                return this.handleSubscriptionResponse(message)
            }

            // 주문장 데이터 처리
            if (message.e === "depthUpdate") {
                const result = this.handleOrderBookUpdate(message)
                if (!result) return null

                return {
                    symbol: result.symbol,
                    orderBook: result.orderBook,
                }
            }

            return null
        } catch (error) {
            return null
        }
    }

    // REST API 요청 포맷
    public formatOrderBookRequest(symbol: string): RestApiRequest {
        return {
            url: `${this.baseUrl}/api/v3/depth`,
            method: "GET",
            params: {
                symbol: this.formatSymbol(symbol),
                limit: "500",
            },
        }
    }

    public formatTickerRequest(symbols: string[]): RestApiRequest {
        return {
            url: `${this.baseUrl}/api/v3/ticker/24hr`,
            method: "GET",
            params:
                symbols.length === 1
                    ? { symbol: this.formatSymbol(symbols[0]) }
                    : undefined,
        }
    }

    public formatTradesRequest(
        symbol: string,
        limit: number = 500
    ): RestApiRequest {
        return {
            url: `${this.baseUrl}/api/v3/trades`,
            method: "GET",
            params: {
                symbol: this.formatSymbol(symbol),
                limit: limit.toString(),
            },
        }
    }

    public formatKlineRequest(
        symbol: string,
        interval: string,
        limit: number = 500
    ): RestApiRequest {
        return {
            url: `${this.baseUrl}/api/v3/klines`,
            method: "GET",
            params: {
                symbol: this.formatSymbol(symbol),
                interval,
                limit: limit.toString(),
            },
        }
    }

    // 내부 유틸리티 메서드
    private getStreamName(coin: CoinInfo): string {
        return `${coin.symbol.toLowerCase()}@depth`
    }

    private formatSymbol(symbol: string): string {
        return symbol.toUpperCase().replace("-", "")
    }

    private handleSubscriptionResponse(message: any): {
        symbol: string
        collectState: CollectState
        error?: string
    } {
        return {
            symbol: this.extractSymbolFromSubscription(message),
            collectState: message.result === null ? "SUBSCRIBED" : "REQUESTED",
            error: message.error?.msg,
        }
    }

    private handleOrderBookUpdate(message: any): {
        symbol: string
        orderBook: OrderBook
    } | null {
        // null을 포함하도록 리턴 타입 수정
        const symbol = message.s
        const lastUpdateId = message.u

        // 시퀀스 검증
        const prevUpdateId = this.lastUpdateIds.get(symbol) || 0
        if (lastUpdateId <= prevUpdateId) {
            return null
        }

        this.lastUpdateIds.set(symbol, lastUpdateId)

        return {
            symbol,
            orderBook: {
                bids: message.b.map(this.parseQuotation),
                asks: message.a.map(this.parseQuotation),
                timestamp: message.E,
                lastUpdateId: lastUpdateId,
            },
        }
    }

    private parseQuotation([price, quantity]: string[]): [number, number] {
        return [Number(price), Number(quantity)]
    }

    private extractSymbolFromSubscription(message: any): string {
        // 구독 응답에서 심볼 추출
        if (message.params?.[0]) {
            const stream = message.params[0]
            return stream.split("@")[0].toUpperCase()
        }
        return "UNKNOWN"
    }
}
