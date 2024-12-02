// src/components/Collector.ts
/**
 * Collector (수집기)
 *
 * 거래소로부터 WebSocket을 통해 시장 데이터를 수집하는 컴포넌트
 * - WebSocket 연결 관리
 * - 데이터 수집 및 검증
 * - 메모리 버퍼 관리
 * - 이벤트 발행
 */

import WebSocket from "ws"
import { Logger } from "../utils/logger"
import EventManager from "../managers/EventManager"
import StateManager from "../managers/StateManager"
import MetricManager from "../managers/MetricManager"
import ErrorManager from "../managers/ErrorManager"
import {
    CollectorConfig,
    ManagerDependencies,
    WebSocketConfig,
    BufferConfig,
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
    private dataBuffer: RawMarketData[]
    private bufferSize: number
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

        this.dataBuffer = []
        this.bufferSize = config.bufferConfig?.size || 1000
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

            // 데이터 검증
            if (this.validateData(rawData)) {
                // 데이터 정규화
                const marketData = this.normalizeData(rawData)

                // 버퍼에 추가
                this.addToBuffer(marketData)

                // 메트릭 업데이트
                await this.updateDataMetrics(marketData)
            }
        } catch (error: any) {
            await this.handleMessageError(error, data)
        }
    }

    private validateData(data: RawMarketData): boolean {
        // 데이터 유효성 검사
        return (
            typeof data.symbol === "string" &&
            typeof data.timestamp === "number" &&
            this.subscriptions.has(data.symbol)
        )
    }

    private normalizeData(rawData: RawMarketData): MarketData {
        // 데이터 정규화
        return {
            exchangeId: this.exchangeId,
            symbol: rawData.symbol,
            timestamp: rawData.timestamp,
            data: rawData.data,
            collectorId: this.id,
        }
    }

    private addToBuffer(data: MarketData): void {
        this.dataBuffer.push(data)

        if (this.dataBuffer.length >= this.bufferSize) {
            this.flushBuffer()
        }
    }

    private async flushBuffer(): Promise<void> {
        if (this.dataBuffer.length === 0) return

        try {
            // 이벤트로 데이터 발행
            await this.eventManager.publish({
                type: "MARKET_DATA",
                payload: this.dataBuffer,
                timestamp: Date.now(),
                source: this.id,
            })

            // 버퍼 초기화
            this.dataBuffer = []
        } catch (error: any) {
            await this.handleBufferFlushError(error)
        }
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
        // 거래소별 구독 메시지 포맷 구현
        return JSON.stringify({
            method: "SUBSCRIBE",
            params: symbols,
            id: Date.now(),
        })
    }

    private createUnsubscriptionMessage(symbols: string[]): string {
        // 거래소별 구독 해제 메시지 포맷 구현
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
            bufferSize: this.dataBuffer.length,
            reconnectAttempts: this.reconnectAttempts,
        }
    }
    private startMetricCollection(): void {
        // 주기적인 메트릭 수집
        setInterval(() => {
            // 메트릭 태그를 문자열로 변환
            const metrics: Record<string, string> = {
                connectionStatus: String(
                    this.ws?.readyState === WebSocket.OPEN
                ),
                bufferSize: String(this.dataBuffer.length),
                subscriptionCount: String(this.subscriptions.size),
                reconnectAttempts: String(this.reconnectAttempts),
            }

            this.metricManager.collect({
                type: MetricType.GAUGE, // enum 사용
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

    private async updateDataMetrics(marketData: MarketData): Promise<void> {
        await this.metricManager.collect({
            type: MetricType.COUNTER, // enum 사용
            module: this.id,
            name: "processed_messages",
            value: 1,
            timestamp: Date.now(),
            tags: {
                symbol: marketData.symbol,
                dataType: marketData.data.type || "unknown", // MarketData의 type 접근 수정
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
            data: { bufferSize: this.dataBuffer.length },
            retryable: true,
        })

        // 버퍼가 가득 찼을 때의 처리
        if (this.dataBuffer.length >= this.bufferSize) {
            this.logger.warn("Buffer full, removing oldest entries")
            // 가장 오래된 데이터 제거
            this.dataBuffer = this.dataBuffer.slice(
                -Math.floor(this.bufferSize * 0.8)
            )
        }
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

        // 구독 상태 재확인
        for (const symbol of symbols) {
            if (this.subscriptions.has(symbol)) {
                this.logger.warn(`Failed to unsubscribe from symbol: ${symbol}`)
            }
        }
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

        // 상태를 ERROR로 변경
        await this.stateManager.changeState(this.id, "ERROR")

        // 이벤트 발행
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

        // 리소스 정리
        this.cleanup()

        this.logger.error(
            `Connection permanently failed after ${this.reconnectAttempts} attempts`
        )
    }
}

export default Collector
