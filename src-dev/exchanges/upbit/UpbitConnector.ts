/**
 * Path: src/exchanges/upbit/UpbitConnector.ts
 * 업비트 전용 커넥터
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { ErrorCode, WebSocketError } from "../../errors/types"
import { ConnectorState } from "../../states/types"
import { WebSocketConfig, WebSocketMessage } from "../../websocket/types"
import { UpbitMessageHandler } from "./UpbitMessageHandler"
import { UpbitOrderBookManager } from "./orderbook/UpbitOrderBookManager"
import { UpbitSubscription } from "./types"
export class UpbitConnector extends ExchangeConnector {
    private messageHandler: UpbitMessageHandler
    private orderBookManager: UpbitOrderBookManager

    constructor(id: string, symbols: string[], config: WebSocketConfig) {
        super(id, symbols, config)
        this.messageHandler = new UpbitMessageHandler()
        this.orderBookManager = new UpbitOrderBookManager()
    }

    protected formatSubscription(symbols: string[]): UpbitSubscription {
        return {
            ticket: `UPBIT_${Date.now()}`,
            type: ["trade", "orderbook"],
            codes: symbols.map(
                (symbol) => `KRW-${symbol.replace(/USD.*/, "")}`
            ),
        }
    }

    protected async subscribe(): Promise<void> {
        try {
            const subscription = this.formatSubscription(this.symbols)
            await this.wsManager.send(subscription)
            this.setState(ConnectorState.SUBSCRIBED)
        } catch (error) {
            throw new WebSocketError(
                ErrorCode.SUBSCRIPTION_FAILED,
                "Failed to subscribe to Upbit streams",
                error as Error
            )
        }
    }

    protected handleMessage(data: unknown): void {
        try {
            const message = this.messageHandler.handleMessage(data)
            this.metrics.messageCount++

            // OrderBook 메시지 처리
            if (message.type === "orderbook") {
                this.handleOrderBookMessage(message)
            }

            this.emit("message", message)
        } catch (error) {
            if (error instanceof WebSocketError) {
                this.handleError(error)
            } else {
                this.handleError(
                    new WebSocketError(
                        ErrorCode.MESSAGE_PARSE_ERROR,
                        "Failed to process Upbit message",
                        error as Error
                    )
                )
            }
        }
    }
    private handleOrderBookMessage(message: WebSocketMessage): void {
        const orderBookUpdate: OrderBookUpdate = {
            symbol: message.symbol,
            sequence: message.data.sequence,
            asks: message.data.asks,
            bids: message.data.bids,
            timestamp: message.data.timestamp,
        }

        this.orderBookManager.updateOrderBook(message.symbol, orderBookUpdate)

        // OrderBook 업데이트 이벤트 발생
        this.emit("orderBookUpdate", {
            symbol: message.symbol,
            orderBook: this.orderBookManager.getOrderBook(message.symbol),
        })
    }

    // OrderBook 조회 메서드
    public getOrderBook(symbol: string): OrderBookSnapshot | undefined {
        return this.orderBookManager.getOrderBook(symbol)
    }

    // 리소스 정리
    public async stop(): Promise<void> {
        this.orderBookManager.clear()
        await super.stop()
    }
}
