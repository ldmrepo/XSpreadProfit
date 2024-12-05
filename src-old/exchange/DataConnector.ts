/**
 * File: src/connector/DataConnector.ts
 * Description: 데이터 커넥터 구현
 */

import { WebSocketClient } from "./WebSocketClient"
import { IExchangeAdapter } from "../exchange/IExchangeAdapter"
import { CollectState, OrderBook } from "../types/coin.types"

export class DataConnector {
    private readonly wsClient: WebSocketClient

    constructor(
        private readonly symbols: string[],
        private readonly url: string,
        private readonly adapter: IExchangeAdapter
    ) {
        this.wsClient = new WebSocketClient(url)
    }

    public async connect(): Promise<void> {
        await this.wsClient.connect()
        this.setupMessageHandler()
        this.setupErrorHandler()
    }

    public disconnect(): void {
        this.wsClient.disconnect()
    }

    public subscribe(symbols: string[]): void {
        const message = this.adapter.formatSubscribeMessage(symbols)
        this.wsClient.send(message)
    }

    public unsubscribe(symbols: string[]): void {
        const message = this.adapter.formatUnsubscribeMessage(symbols)
        this.wsClient.send(message)
    }

    private setupMessageHandler(): void {
        this.wsClient.onMessage((data: string) => {
            const result = this.adapter.parseMessage(data)
            if (!result) return

            // orderBook이 있는 경우 처리
            if (result.orderBook) {
                this.handleOrderBook(result.orderBook)
            }

            // 상태 변경이 있는 경우 처리
            if (result.collectState) {
                this.handleStateChange(result.symbol, result.collectState)
            }

            // 에러가 있는 경우 처리
            if (result.error) {
                this.handleError(result.symbol, result.error)
            }
        })
    }

    private handleStateChange(symbol: string, state: CollectState): void {
        console.log(`State change for ${symbol}:`, state)
    }

    private setupErrorHandler(): void {
        this.wsClient.onError((error: Error) => {
            this.handleWebSocketError(error)
        })
    }
    private handleWebSocketError(error: Error): void {
        console.error("WebSocket error:", error)
    }

    private handleOrderBook(orderBook: OrderBook): void {
        console.log("Order book update:", orderBook)
    }

    private handleError(symbol: string, error: string): void {
        console.error(`Error for ${symbol}:`, error)
    }
}
