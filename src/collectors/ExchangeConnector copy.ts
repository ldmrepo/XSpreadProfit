import WebSocket from "ws"
import { EventEmitter } from "events"
import { BookTickerData, ExchangeInfo } from "../exchanges/common/types"
import { ConnectorMetrics } from "../types/metrics"
import { BookTickerStorage } from "../exchanges/common/BookTickerStorage"
import { ConnectorState } from "../states/types"
import { ExchangeConfig } from "../config/types"
import { IExchangeConnector, SymbolGroup } from "./types"
import { WebSocketMessage } from "../websocket/types"
import { IWebSocketManager } from "../websocket/IWebSocketManager"

abstract class ExchangeConnector
    extends EventEmitter
    implements IExchangeConnector
{
    private ws: WebSocket | null = null
    private isReconnecting = false
    private metrics: ConnectorMetrics
    private stateTimestamp: number
    private storage: BookTickerStorage
    private state: ConnectorState
    private shouldReconnect = false
    private messageQueue: BookTickerData[] = []
    private isProcessingQueue = false
    private readonly BATCH_SIZE = 100 // 적절한 크기로 조정
    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super()
        this.stateTimestamp = Date.now()
        this.state = ConnectorState.INITIAL
        this.metrics = this.initializeMetrics()
        this.storage = BookTickerStorage.getInstance()
    }

    private initializeMetrics(): ConnectorMetrics {
        return {
            timestamp: Date.now(),
            status: this.state,
            messageCount: 0,
            errorCount: 0,
            reconnectCount: 0, // 초기화
            id: this.id,
            symbols: this.symbols,
            state: this.state,
        }
    }

    private updateMetrics(update: Partial<ConnectorMetrics>): void {
        this.metrics = {
            ...this.metrics,
            ...update,
            timestamp: Date.now(),
        }
        this.emit("metricsUpdated", this.metrics)
    }

    private createWebSocket(url: string): WebSocket {
        const ws = new WebSocket(url)

        ws.on("open", () => {
            console.log(
                "🚀 ~ 연결완료",
                this.id,
                this.config.exchange,
                this.config.exchangeType
            )
            this.setState(ConnectorState.CONNECTED)
        })

        ws.on("message", (data) => {
            this.handleMessage(data)
            this.updateMetrics({
                messageCount: this.metrics.messageCount + 1,
            })
        })

        ws.on("ping", (data) => {
            console.log(
                "🚀 ~ Ping 수신",
                this.id,
                this.config.exchange,
                this.config.exchangeType,
                data.toString()
            )
            this.ws!.pong(data) // 수신된 ping의 payload 그대로 응답
            console.log(
                "🚀 ~ Pong 응답",
                this.id,
                this.config.exchange,
                this.config.exchangeType,
                data.toString()
            )
        })

        ws.on("error", (error) => {
            console.error(
                "🚀 ~ 오류",
                this.id,
                this.config.exchange,
                this.config.exchangeType
            )
            this.setState(ConnectorState.ERROR)
            this.updateMetrics({
                errorCount: this.metrics.errorCount + 1,
            })
            this.shouldReconnect = true // 재연결 플래그만 설정
        })

        ws.on("close", () => {
            console.log(
                "🚀 ~ 연결종료",
                this.id,
                this.config.exchange,
                this.config.exchangeType
            )
            this.setState(ConnectorState.DISCONNECTED)
            if (this.shouldReconnect) {
                this.shouldReconnect = false
                this.reconnect() // close 이벤트에서만 재연결 시도
            }
        })

        return ws
    }

    public async start(): Promise<void> {
        if (this.ws) return

        console.log("Starting connector:", this.id, this.symbols.length)
        const streams = this.symbols
            .map((s) => `${s.toLowerCase()}@bookTicker`)
            .join("/")

        const wsUrl = `${this.config.wsUrl}?streams=${streams}`
        this.setState(ConnectorState.CONNECTING)
        this.ws = this.createWebSocket(wsUrl)
    }

    private reconnect(): Promise<void> {
        if (this.isReconnecting) return Promise.resolve()
        this.isReconnecting = true

        // 재연결 시도 횟수 증가
        this.updateMetrics({
            reconnectCount: this.metrics.reconnectCount + 1,
        })

        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    await this.stop()
                    await this.start()
                } finally {
                    this.isReconnecting = false
                }
                resolve()
            }, 5000)
        })
    }

    public async stop(): Promise<void> {
        if (!this.ws) return
        this.ws.close()
        this.ws = null
        this.setState(ConnectorState.DISCONNECTED)
    }

    private async handleMessage(data: WebSocket.Data): Promise<void> {
        try {
            const message = JSON.parse(data.toString())
            if (!this.validateExchangeMessage(message)) return

            const normalized = this.normalizeExchangeMessage(message)

            // 메시지 이벤트는 즉시 발송
            this.emit("message", normalized)

            // 큐에 저장
            //this.messageQueue.push(normalized.data)

            // 큐 처리 시작
            //this.processQueue()

            this.updateMetrics({
                messageCount: this.metrics.messageCount + 1,
            })
        } catch (error) {
            console.error("Message handling failed:", error)
            this.updateMetrics({
                errorCount: this.metrics.errorCount + 1,
            })
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return

        this.isProcessingQueue = true

        try {
            while (this.messageQueue.length > 0) {
                // 배치 처리
                const batch = this.messageQueue.splice(0, this.BATCH_SIZE)
                await Promise.all(
                    batch.map((data) =>
                        this.storage.storeBookTicker(data).catch((error) => {
                            console.error("Redis storage failed:", error)
                            this.updateMetrics({
                                errorCount: this.metrics.errorCount + 1,
                            })
                        })
                    )
                )
            }
        } finally {
            this.isProcessingQueue = false
        }
    }

    public setState(state: ConnectorState): void {
        this.state = state
        this.stateTimestamp = Date.now()
        this.updateMetrics({
            status: state,
            state: state,
        })
        this.emit("stateChange", {
            id: this.getId(),
            previousState: this.state,
            currentState: state,
            timestamp: this.stateTimestamp,
        })
    }

    public getMetrics(): ConnectorMetrics {
        return {
            ...this.metrics,
            timestamp: Date.now(),
        }
    }

    public getId(): string {
        return this.id
    }

    public getState(): ConnectorState {
        return this.state
    }
    protected handleError(error: unknown): void {
        this.metrics.errorCount++
        this.emit("error", error)
    }
    // Required implementations
    protected abstract validateExchangeMessage(data: unknown): boolean
    protected abstract normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData>
}

export { ExchangeConnector }
