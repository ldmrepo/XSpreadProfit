/**
 * Collector (수집기)
 *
 * 거래소로부터 WebSocket을 통해 시장 데이터를 수집하는 컴포넌트
 * - WebSocket 연결 관리
 * - 데이터 수집 및 검증
 * - SharedBuffer를 통한 메모리 관리
 * - 이벤트 발행
 */

import WebSocket from "ws"
import { Logger } from "../utils/logger"
import { SharedBuffer } from "../utils/SharedBuffer"
import EventManager from "../managers/EventManager"
import StateManager from "../managers/StateManager"
import MetricManager from "../managers/MetricManager"
import ErrorManager from "../managers/ErrorManager"
import {
    CollectorConfig,
    ManagerDependencies,
    WebSocketConfig,
} from "../types/config"
import { MarketData, RawMarketData } from "../types/data"
import { MetricType } from "../types/metrics"

class Collector {
    private id: string
    private exchangeId: string
    private wsUrl: string
    private ws: WebSocket | null
    private eventManager: EventManager
    private stateManager: StateManager
    private metricManager: MetricManager
    private errorManager: ErrorManager
    private logger: Logger

    // 연결 관리
    private reconnectAttempts: number
    private maxReconnectAttempts: number
    private reconnectInterval: number
    private pingInterval: number
    private pingTimeout: NodeJS.Timeout | null

    // 데이터 관리
    private dataBuffer: SharedBuffer<RawMarketData>
    private subscriptions: Set<string>

    constructor(config: CollectorConfig) {
        this.id = config.id
        this.exchangeId = config.exchangeId
        this.wsUrl = config.websocketUrl
        this.eventManager = config.managers.eventManager
        this.stateManager = config.managers.stateManager
        this.metricManager = config.managers.metricManager
        this.errorManager = config.managers.errorManager
        this.logger = Logger.getInstance(`Collector:${this.id}`)

        // 초기화
        this.ws = null
        this.reconnectAttempts = 0
        this.maxReconnectAttempts = config.wsConfig?.maxReconnectAttempts || 5
        this.reconnectInterval = config.wsConfig?.reconnectInterval || 5000
        this.pingInterval = config.wsConfig?.pingInterval || 30000
        this.pingTimeout = null

        // SharedBuffer 초기화
        this.dataBuffer = new SharedBuffer<RawMarketData>(
            `${this.id}_buffer`,
            {
                maxSize: config.bufferConfig?.maxSize || 1000,
                flushThreshold: 80,
                flushInterval: config.bufferConfig?.flushInterval || 1000,
            },
            async (items) => this.handleBufferFlush(items)
        )

        this.subscriptions = new Set()
    }

    async start(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STARTING")

            // WebSocket 연결 수립
            await this.connect()

            // 핑/퐁 모니터링 시작
            this.startHeartbeat()

            // 메트릭 수집 시작
            this.startMetricCollection()

            await this.stateManager.changeState(this.id, "RUNNING")
            this.logger.info(`Collector ${this.id} started successfully`)
        } catch (error: any) {
            await this.handleStartupError(error)
            throw error
        }
    }

    async stop(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STOPPING")

            // WebSocket 연결 종료
            this.disconnect()

            // 리소스 정리
            this.cleanup()

            // 버퍼 정리
            await this.dataBuffer.flush()
            this.dataBuffer.dispose()

            await this.stateManager.changeState(this.id, "STOPPED")
            this.logger.info(`Collector ${this.id} stopped successfully`)
        } catch (error: any) {
            await this.handleStopError(error)
            throw error
        }
    }

    async subscribe(symbols: string[]): Promise<void> {
        try {
            const message = this.createSubscriptionMessage(symbols)
            await this.sendMessage(message)

            symbols.forEach((symbol) => this.subscriptions.add(symbol))
            this.logger.info(`Subscribed to symbols: ${symbols.join(", ")}`)
        } catch (error: any) {
            await this.handleSubscriptionError(error, symbols)
            throw error
        }
    }

    async unsubscribe(symbols: string[]): Promise<void> {
        try {
            const message = this.createUnsubscriptionMessage(symbols)
            await this.sendMessage(message)

            symbols.forEach((symbol) => this.subscriptions.delete(symbol))
            this.logger.info(`Unsubscribed from symbols: ${symbols.join(", ")}`)
        } catch (error: any) {
            await this.handleUnsubscriptionError(error, symbols)
            throw error
        }
    }

    private async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl)

            this.ws.on("open", () => {
                this.handleConnectionOpen()
                resolve()
            })

            this.ws.on("message", (data: WebSocket.Data) => {
                this.handleMessage(data)
            })

            this.ws.on("close", () => {
                this.handleConnectionClose()
            })

            this.ws.on("error", (error) => {
                this.handleConnectionError(error)
                reject(error)
            })
        })
    }

    private disconnect(): void {
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }

    private async handleMessage(data: WebSocket.Data): Promise<void> {
        try {
            const rawData = JSON.parse(data.toString())
            if (this.validateData(rawData)) {
                await this.dataBuffer.push(rawData)
                await this.updateDataMetrics(rawData)
            } else {
                console.warn(`[Collector] 데이터 검증 실패:`, rawData)
            }
        } catch (error: any) {
            console.error(`[Collector] 데이터 처리 중 에러 발생:`, error)
            await this.errorManager.handleError({
                code: "PROCESS",
                type: "RECOVERABLE",
                module: this.id,
                message: "데이터 처리 실패",
                timestamp: Date.now(),
                error,
            })
        }
    }

    private async handleBufferFlush(items: RawMarketData[]): Promise<void> {
        try {
            await this.eventManager.publish({
                type: "MARKET_DATA",
                payload: items,
                timestamp: Date.now(),
                source: this.id,
            })
        } catch (error: any) {
            await this.handleBufferFlushError(error)
        }
    }

    private validateData(data: RawMarketData): boolean {
        return (
            typeof data.symbol === "string" &&
            typeof data.timestamp === "number" &&
            this.subscriptions.has(data.symbol)
        )
    }

    private startHeartbeat(): void {
        this.pingTimeout = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping()
            }
        }, this.pingInterval)
    }

    private async handleConnectionOpen(): Promise<void> {
        this.reconnectAttempts = 0

        // 기존 구독 재설정
        if (this.subscriptions.size > 0) {
            await this.resubscribe()
        }
    }

    private async handleConnectionClose(): Promise<void> {
        this.cleanup()

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            setTimeout(() => this.connect(), this.reconnectInterval)
        } else {
            await this.handleMaxReconnectError()
        }
    }

    private async handleConnectionError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "NETWORK",
            type: "RECOVERABLE",
            module: this.id,
            message: "WebSocket connection error",
            timestamp: Date.now(),
            error: error,
        })
    }

    private cleanup(): void {
        if (this.pingTimeout) {
            clearInterval(this.pingTimeout)
            this.pingTimeout = null
        }
    }

    private async resubscribe(): Promise<void> {
        const symbols = Array.from(this.subscriptions)
        await this.subscribe(symbols)
    }

    private createSubscriptionMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "SUBSCRIBE",
            params: symbols,
            id: Date.now(),
        })
    }

    private createUnsubscriptionMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "UNSUBSCRIBE",
            params: symbols,
            id: Date.now(),
        })
    }

    private async sendMessage(message: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected")
        }
        this.ws.send(message)
    }

    getStatus(): Record<string, any> {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            subscriptions: Array.from(this.subscriptions),
            bufferMetrics: this.dataBuffer.getMetrics(),
            reconnectAttempts: this.reconnectAttempts,
        }
    }

    private startMetricCollection(): void {
        setInterval(() => {
            const metrics: Record<string, string> = {
                connectionStatus: String(
                    this.ws?.readyState === WebSocket.OPEN
                ),
                subscriptionCount: String(this.subscriptions.size),
                reconnectAttempts: String(this.reconnectAttempts),
            }

            this.metricManager.collect({
                type: MetricType.GAUGE,
                module: this.id,
                name: "collector_metrics",
                value: 1,
                timestamp: Date.now(),
                tags: metrics,
            })
        }, 5000)
    }

    private async handleStartupError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "FATAL",
            module: this.id,
            message: "Failed to start collector",
            timestamp: Date.now(),
            error,
            retryable: false,
        })

        await this.stateManager.changeState(this.id, "ERROR")
    }

    private async handleStopError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Error during collector shutdown",
            timestamp: Date.now(),
            error,
            retryable: false,
        })
    }

    private async handleSubscriptionError(
        error: Error,
        symbols: string[]
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Subscription error",
            timestamp: Date.now(),
            error,
            data: { symbols },
            retryable: true,
        })
    }

    private async updateDataMetrics(marketData: RawMarketData): Promise<void> {
        await this.metricManager.collect({
            type: MetricType.COUNTER,
            module: this.id,
            name: "processed_messages",
            value: 1,
            timestamp: Date.now(),
            tags: {
                symbol: marketData.symbol,
                dataType: "unknown",
            },
        })
    }

    private async handleMessageError(error: Error, data: any): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Message processing error",
            timestamp: Date.now(),
            error,
            data: { rawData: data },
            retryable: true,
        })
    }

    private async handleBufferFlushError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "STORAGE",
            type: "RECOVERABLE",
            module: this.id,
            message: "Buffer flush error",
            timestamp: Date.now(),
            error,
            retryable: true,
        })
    }

    private async handleUnsubscriptionError(
        error: Error,
        symbols: string[]
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Unsubscription error",
            timestamp: Date.now(),
            error,
            data: { symbols },
            retryable: true,
        })
    }

    private async handleMaxReconnectError(): Promise<void> {
        await this.errorManager.handleError({
            code: "NETWORK",
            type: "FATAL",
            module: this.id,
            message: "Maximum reconnection attempts reached",
            timestamp: Date.now(),
            retryable: false,
            data: {
                totalAttempts: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts,
                subscriptionCount: this.subscriptions.size,
            },
        })

        await this.stateManager.changeState(this.id, "ERROR")

        await this.eventManager.publish({
            type: "SYSTEM.CONNECTION_FAILED",
            payload: {
                componentId: this.id,
                reconnectAttempts: this.reconnectAttempts,
                timestamp: Date.now(),
            },
            timestamp: Date.now(),
            source: this.id,
        })

        this.cleanup()

        this.logger.error(
            `Connection permanently failed after ${this.reconnectAttempts} attempts`
        )
    }
}

export default Collector
