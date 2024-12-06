/**
 * Path: src/exchanges/binance/BinanceConnector.ts
 * 바이낸스 전용 커넥터
 */

import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage, WebSocketConfig } from "../../websocket/types"
import { BinanceRawMessage, BinanceSubscription } from "./types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types"
import { BinanceMessageHandler } from "./BinanceMessageHandler"
import { ConnectorState } from "../../states/types"
import { BinanceOrderBookManager } from "./orderbook/BinanceOrderBookManager"
import { ErrorHandler } from "../../errors/ErrorHandler"
import { WebSocketManager } from "../../websocket/WebSocketManager"
import { SymbolGroup } from "../../collectors/types"

export class BinanceConnector extends ExchangeConnector {
    protected messageHandler: BinanceMessageHandler
    protected orderBookManager: BinanceOrderBookManager
    protected errorHandler: ErrorHandler

    constructor(
        protected readonly id: string,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: WebSocketManager // WebSocketManager를 외부에서 주입받도록 수정
    ) {
        super(id, symbols, wsManager)
        this.messageHandler = new BinanceMessageHandler()
        this.orderBookManager = new BinanceOrderBookManager()

        // ErrorHandler 초기화
        this.errorHandler = new ErrorHandler(
            async () => this.handleFatalError(), // 치명적 에러 발생 시 실행
            (error) => this.emit("error", error) // 일반 에러 발생 시 이벤트 전파
        )
    }
    async start(): Promise<void> {
        if (this.state !== ConnectorState.INITIAL) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Connector can only be started from INITIAL state"
            )
        }

        try {
            // INITIAL -> CONNECTING
            this.setState(ConnectorState.CONNECTING)

            // WebSocket 연결 시도
            await new Promise<void>((resolve, reject) => {
                const errorHandler = (error: Error) => {
                    // CONNECTING -> ERROR
                    this.setState(ConnectorState.ERROR)
                    reject(
                        new WebSocketError(
                            ErrorCode.CONNECTION_FAILED,
                            "Connection failed",
                            error
                        )
                    )
                }

                this.wsManager.once("error", errorHandler)
                this.wsManager.once("connected", () => {
                    this.wsManager.removeListener("error", errorHandler)
                    resolve()
                })

                this.wsManager.connect().catch(errorHandler)
            })

            // CONNECTING -> CONNECTED -> SUBSCRIBING
            this.setState(ConnectorState.CONNECTED)
            this.setState(ConnectorState.SUBSCRIBING)

            // 구독 시도
            await this.subscribe()

            // SUBSCRIBING -> SUBSCRIBED
            this.setState(ConnectorState.SUBSCRIBED)
        } catch (error) {
            // 현재 상태에서 ERROR로 전이
            this.setState(ConnectorState.ERROR)
            throw error
        }
    }
    protected async subscribe(): Promise<void> {
        try {
            const subscriptions = this.formatbookTickerSubscription(
                this.symbols
            )
            for (const sub of subscriptions) {
                await this.wsManager.send(sub)
            }
            // 상태 전이는 start() 메서드에서 처리
        } catch (error) {
            throw new WebSocketError(
                ErrorCode.SUBSCRIPTION_FAILED,
                "Failed to subscribe to Binance streams",
                error as Error
            )
        }
    }
    protected formatbookTickerSubscription(
        symbols: string[]
    ): BinanceSubscription[] {
        return symbols.map((symbol) => ({
            method: "SUBSCRIBE",
            params: [`${symbol.toLowerCase()}@bookTicker`],
            id: Date.now(),
        }))
    }
    protected formatSubscription(symbols: string[]): BinanceSubscription[] {
        return symbols.map((symbol) => ({
            method: "ticker.book",
            params: [
                // `${symbol.toLowerCase()}@trade`,
                `${symbol.toLowerCase()}@bookTicker`,
                // `${symbol.toLowerCase()}@depth`,
            ],
            id: Date.now(),
        }))
    }

    protected isValidMessage(data: unknown): data is WebSocketMessage {
        try {
            const binanceMsg = data as BinanceRawMessage
            return (
                typeof binanceMsg === "object" &&
                binanceMsg !== null &&
                "e" in binanceMsg &&
                "s" in binanceMsg
            )
        } catch {
            return false
        }
    }

    protected normalizeMessage(message: BinanceRawMessage): WebSocketMessage {
        return {
            type: message.e,
            symbol: message.s,
            data: {
                price: parseFloat(message.p),
                quantity: parseFloat(message.q),
                timestamp: message.T,
                tradeId: message.t,
            },
        }
    }

    protected handleMessage(data: unknown): void {
        try {
            const message = this.messageHandler.handleMessage(data)
            this.metrics.messageCount++
            this.emit("message", message)
        } catch (error) {
            const wsError =
                error instanceof WebSocketError
                    ? error
                    : new WebSocketError(
                          ErrorCode.MESSAGE_PARSE_ERROR,
                          "Failed to process Binance message",
                          error as Error,
                          ErrorSeverity.MEDIUM
                      )
            this.handleError(wsError)
        }
    }
    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Internal connector error",
                      error as Error
                  )

        this.setState(ConnectorState.ERROR) // 에러 상태로 전환
        this.errorHandler.handleError(wsError)
        this.emit("error", wsError)
    }

    protected async handleFatalError(): Promise<void> {
        try {
            await this.stop()
        } catch (error) {
            console.error("Failed to handle fatal error:", error)
        }
    }
}
