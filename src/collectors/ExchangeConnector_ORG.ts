import WebSocket from "ws"
import { EventEmitter } from "events"
import { BookTickerData } from "../exchanges/common/types"
import { ConnectorMetrics } from "../types/metrics"
import { BookTickerStorage } from "../exchanges/common/BookTickerStorage"
import { ConnectorState } from "../states/types"
import { ExchangeConfig } from "../config/types"
import { IExchangeConnector, SymbolGroup } from "./types"
import { WebSocketMessage } from "../websocket/types"

/**
 * 거래소 WebSocket 연결 및 데이터 수집을 위한 기본 클래스
 * - 단순성: 핵심 기능에 집중
 * - 병렬성: 메시지 처리와 저장을 분리
 * - 성능: 배치 처리 및 버퍼링 적용
 * - 안정성: 자동 복구 및 상태 관리 강화
 */
abstract class ExchangeConnector
    extends EventEmitter
    implements IExchangeConnector
{
    private stateTimestamp: number
    private ws: WebSocket | null = null
    private messageBuffer: BookTickerData[] = []
    private processingTimer: NodeJS.Timer | null = null
    private reconnectTimer: NodeJS.Timer | null = null
    private metrics: ConnectorMetrics
    private storage: BookTickerStorage
    private state = ConnectorState.INITIAL
    private readonly BUFFER_FLUSH_INTERVAL = 100 // 100ms
    private readonly BUFFER_SIZE = 1000 // 1000 messages
    private readonly RECONNECT_DELAY = 5000 // 5s

    constructor(
        private readonly id: string,
        private readonly config: ExchangeConfig,
        private readonly symbols: SymbolGroup
    ) {
        super()
        this.stateTimestamp = Date.now()
        this.storage = BookTickerStorage.getInstance()
        this.metrics = this.initializeMetrics()
        this.setupBufferProcessor()
    }

    private initializeMetrics(): ConnectorMetrics {
        return {
            timestamp: Date.now(),
            status: this.state,
            messageCount: 0,
            errorCount: 0,
            reconnectCount: 0,
            id: this.id,
            symbols: this.symbols,
            state: this.state,
        }
    }

    private setupBufferProcessor(): void {
        this.processingTimer = setInterval(() => {
            this.flushBuffer().catch((error) => {
                console.error(`Buffer flush failed: ${error.message}`)
                this.updateMetrics({ errorCount: this.metrics.errorCount + 1 })
            })
        }, this.BUFFER_FLUSH_INTERVAL)
    }

    private async flushBuffer(): Promise<void> {
        if (this.messageBuffer.length === 0) return

        const batch = this.messageBuffer.splice(0, this.BUFFER_SIZE)

        try {
            await Promise.all(
                batch.map((data) =>
                    this.storage.storeBookTicker(data).catch((error) => {
                        console.error(`Storage error: ${error.message}`)
                        throw error
                    })
                )
            )
        } catch (error) {
            // 저장 실패 시 메트릭만 업데이트하고 계속 진행
            this.updateMetrics({ errorCount: this.metrics.errorCount + 1 })
        }
    }

    private createWebSocket(): WebSocket {
        const streams = this.symbols
            .map((s) => `${s.toLowerCase()}@bookTicker`)
            .join("/")

        const ws = new WebSocket(`${this.config.wsUrl}?streams=${streams}`)

        ws.on("open", () => {
            console.log(`Connected: ${this.id}`)
            this.updateState(ConnectorState.CONNECTED)
        })

        ws.on("message", this.handleMessage.bind(this))

        ws.on("ping", (data) => ws.pong(data))

        ws.on("error", (error) => {
            console.error(`Socket error: ${this.id}`, error)
            this.updateState(ConnectorState.ERROR)
            this.scheduleReconnect()
        })

        ws.on("close", () => {
            console.log(`Disconnected: ${this.id}`)
            this.updateState(ConnectorState.DISCONNECTED)
            this.scheduleReconnect()
        })

        return ws
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString())
            if (!this.validateExchangeMessage(message)) return

            const normalized = this.normalizeExchangeMessage(message)

            // 메시지 이벤트는 즉시 발송
            this.emit("message", normalized)

            // 버퍼에 추가
            this.messageBuffer.push(normalized.data)

            // 버퍼가 가득 차면 즉시 처리
            if (this.messageBuffer.length >= this.BUFFER_SIZE) {
                this.flushBuffer().catch(console.error)
            }

            this.updateMetrics({ messageCount: this.metrics.messageCount + 1 })
        } catch (error: any) {
            console.error(`Message handling error: ${error.message}`)
            this.updateMetrics({ errorCount: this.metrics.errorCount + 1 })
        }
    }

    private updateState(newState: ConnectorState): void {
        const prevState = this.state
        this.state = newState

        this.updateMetrics({
            status: newState,
            state: newState,
            timestamp: Date.now(),
        })

        this.emit("stateChange", {
            id: this.id,
            previousState: prevState,
            currentState: newState,
            timestamp: Date.now(),
        })
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.stop()
                await this.start()
            } catch (error: any) {
                console.error(`Reconnection failed: ${error.message}`)
            } finally {
                this.reconnectTimer = null
            }
        }, this.RECONNECT_DELAY)

        this.updateMetrics({ reconnectCount: this.metrics.reconnectCount + 1 })
    }

    public async start(): Promise<void> {
        if (this.ws) return

        try {
            this.updateState(ConnectorState.CONNECTING)
            this.ws = this.createWebSocket()
        } catch (error) {
            this.updateState(ConnectorState.ERROR)
            throw error
        }
    }

    public async stop(): Promise<void> {
        if (!this.ws) return

        if (this.processingTimer) {
            clearInterval(this.processingTimer)
            this.processingTimer = null
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }

        // 남은 메시지 처리
        await this.flushBuffer()

        this.ws.close()
        this.ws = null
        this.updateState(ConnectorState.DISCONNECTED)
    }

    public getMetrics(): ConnectorMetrics {
        return { ...this.metrics, timestamp: Date.now() }
    }

    public getId(): string {
        return this.id
    }

    public getState(): ConnectorState {
        return this.state
    }

    private updateMetrics(update: Partial<ConnectorMetrics>): void {
        this.metrics = {
            ...this.metrics,
            ...update,
            timestamp: Date.now(),
        }
        this.emit("metricsUpdated", this.metrics)
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
    // Abstract methods for exchange-specific implementations
    protected abstract validateExchangeMessage(data: unknown): boolean
    protected abstract normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData>
}

export { ExchangeConnector }
