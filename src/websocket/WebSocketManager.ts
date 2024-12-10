/**
 * Path: src/websocket/WebSocketManager.ts
 * WebSocket 연결 관리 및 메시지 송수신 담당
 */

import { EventEmitter } from "events"
import { IWebSocketClient } from "./IWebSocketClient"
import { WebSocketConfig } from "./types"
import {
    ConnectorState,
    StateTransitionEvent,
    validStateTransitions,
} from "../states/types"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types"
import { IErrorHandler } from "../errors/ErrorHandler"
import {
    ExtendedWebSocketManagerMetrics,
    TimeSeriesMetric,
} from "../types/metrics"
import * as dns from "dns"

interface ReconnectStep {
    attemptDelay: number
    subscriptionBatchSize: number
}

export class WebSocketManager extends EventEmitter {
    private boundHandlers: Map<string, (...args: any[]) => void>
    private state: ConnectorState = ConnectorState.INITIAL
    private reconnectAttempts = 0
    private pingTimer?: NodeJS.Timer
    private pongTimer?: NodeJS.Timer
    private metrics: ExtendedWebSocketManagerMetrics =
        this.createInitialMetrics()
    private networkStatus: boolean = true
    private networkCheckTimer?: NodeJS.Timer
    private reconnectTimeout?: NodeJS.Timeout
    private networkReconnectInProgress: boolean = false

    constructor(
        public readonly client: IWebSocketClient,
        public readonly config: WebSocketConfig,
        public readonly errorHandler: IErrorHandler,
        public readonly id: string = `ws_${Date.now()}`
    ) {
        super()
        console.log("🚀 ~ WebSocketManager ~ id:", id)
        this.boundHandlers = new Map()
        this.setupClientEventHandlers()
        this.setupNetworkMonitoring()
    }

    // 소멸자 메서드 추가
    public destroy(): void {
        this.cleanup()
        this.reconnectAttempts = 0
        this.state = ConnectorState.INITIAL
        this.metrics = this.createInitialMetrics()
    }

    private setupNetworkMonitoring(): void {
        this.networkCheckTimer = setInterval(async () => {
            await this.checkNetworkAndReconnect()
        }, 5000)
    }
    private clearReconnectTimeout(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = undefined
        }
    }

    private async checkNetworkAndReconnect(): Promise<void> {
        if (this.networkReconnectInProgress) {
            return // 이미 재연결 진행 중이면 중복 실행 방지
        }

        try {
            this.networkReconnectInProgress = true
            const isOnline = await dns.promises.lookup("8.8.8.8")

            if (
                isOnline &&
                (this.state === ConnectorState.ERROR ||
                    this.state === ConnectorState.DISCONNECTED)
            ) {
                this.clearReconnectTimeout() // 기존 타임아웃 클리어
                await this.handleReconnect()
            }
        } catch (error) {
            this.handleError(error)
        } finally {
            this.networkReconnectInProgress = false
        }
    }

    private setupClientEventHandlers(): void {
        // 핸들러 바인딩 및 저장
        const handlers = {
            open: this.handleOpen.bind(this),
            message: this.handleMessage.bind(this),
            close: this.handleClose.bind(this),
            error: this.handleError.bind(this),
        }

        // 핸들러 등록 및 저장
        Object.entries(handlers).forEach(([event, handler]) => {
            this.boundHandlers.set(event, handler)
            this.client.on(event, handler)
        })
    }

    public cleanup(): void {
        this.clearReconnectTimeout()
        this.clearTimers() // ping/pong 타이머
        if (this.networkCheckTimer) {
            clearInterval(this.networkCheckTimer)
            this.networkCheckTimer = undefined
        }

        this.boundHandlers.forEach((handler, event) => {
            this.client.removeListener(event, handler)
        })
        this.boundHandlers.clear()
        this.removeAllListeners()
        this.networkReconnectInProgress = false
    }

    private createInitialMetrics(): ExtendedWebSocketManagerMetrics {
        const now = Date.now()
        const createTimeSeriesMetric = (): TimeSeriesMetric => ({
            count: 0,
            lastUpdated: now,
        })

        return {
            totalConnections: createTimeSeriesMetric(),
            successfulConnections: createTimeSeriesMetric(),
            failedConnections: createTimeSeriesMetric(),
            activeConnections: createTimeSeriesMetric(),
            totalMessages: createTimeSeriesMetric(),
            errors: {
                count: 0,
                lastUpdated: now,
                byCode: Object.values(ErrorCode).reduce(
                    (acc, code) => ({ ...acc, [code]: 0 }),
                    {} as Record<ErrorCode, number>
                ),
                bySeverity: Object.values(ErrorSeverity).reduce(
                    (acc, severity) => ({ ...acc, [severity]: 0 }),
                    {} as Record<ErrorSeverity, number>
                ),
            },
            currentState: {
                state: ConnectorState.INITIAL,
                since: now,
            },
            reconnects: {
                attempts: createTimeSeriesMetric(),
                successes: createTimeSeriesMetric(),
                failures: createTimeSeriesMetric(),
            },
        }
    }

    private isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean {
        return validStateTransitions[from]?.includes(to) ?? false
    }

    private updateState(
        newState: ConnectorState,
        metadata?: Record<string, unknown>
    ): void {
        console.log("State Change:", this.state, "->", newState)
        if (this.state === newState) return

        if (!this.isValidStateTransition(this.state, newState)) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid state transition from ${this.state} to ${newState}`
            )
        }
        const now = Date.now()
        const previousState = this.state

        if (
            newState === ConnectorState.ERROR ||
            newState === ConnectorState.DISCONNECTED
        ) {
            this.clearTimers()
        }
        this.state = newState
        this.metrics.currentState.state = newState
        this.metrics.currentState.since = now
        const event: StateTransitionEvent = {
            id: this.id,
            previousState,
            currentState: newState,
            timestamp: now,
            metadata: {
                ...metadata,
                metrics: {
                    reconnectAttempts: this.reconnectAttempts,
                    errors: this.metrics.errors.count,
                    reconnects: this.metrics.reconnects.attempts.count,
                },
            },
        }
        this.emit("stateChange", event)
        this.updateMetricsForState(newState, now)
    }

    private updateMetricsForState(
        state: ConnectorState,
        timestamp: number
    ): void {
        const updateMetric = (
            metric: keyof ExtendedWebSocketManagerMetrics,
            increment: number
        ) => {
            if (
                typeof this.metrics[metric] === "object" &&
                "count" in this.metrics[metric]
            ) {
                ;(this.metrics[metric] as TimeSeriesMetric).count += increment
                ;(this.metrics[metric] as TimeSeriesMetric).lastUpdated =
                    timestamp
            }
        }

        switch (state) {
            case ConnectorState.CONNECTING:
                updateMetric("totalConnections", 1)
                break
            case ConnectorState.CONNECTED:
                updateMetric("successfulConnections", 1)
                updateMetric("activeConnections", 1)
                break
            case ConnectorState.ERROR:
                updateMetric("failedConnections", 1)
                break
            case ConnectorState.DISCONNECTED:
                updateMetric("activeConnections", -1)
                break
        }

        this.emit("metricsUpdate", this.getMetricsSnapshot())
    }

    private setupPing(): void {
        if (this.config.options?.pingInterval) {
            this.pingTimer = setInterval(() => {
                try {
                    this.client.send({ type: "ping" })
                    this.setupPongTimeout()
                } catch (error) {
                    this.handleError(error)
                }
            }, this.config.options.pingInterval)
        }
    }

    private setupPongTimeout(): void {
        if (this.config.options?.pongTimeout) {
            this.pongTimer = setTimeout(() => {
                this.handleError(
                    new WebSocketError(
                        ErrorCode.CONNECTION_TIMEOUT,
                        "Pong response timeout",
                        undefined,
                        ErrorSeverity.HIGH
                    )
                )
            }, this.config.options.pongTimeout)
        }
    }

    private clearTimers(): void {
        if (this.pingTimer) clearInterval(this.pingTimer)
        if (this.pongTimer) clearTimeout(this.pongTimer)
    }

    private async handleReconnect(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (
                this.networkReconnectInProgress ||
                (this.state === ConnectorState.RECONNECTING &&
                    this.reconnectAttempts > 0)
            ) {
                resolve()
                return
            }

            this.clearReconnectTimeout()
            const timeoutDuration =
                this.config.options?.connectionTimeout ?? 30000
            this.reconnectTimeout = setTimeout(() => {
                reject(
                    new WebSocketError(
                        ErrorCode.CONNECTION_TIMEOUT,
                        "Reconnection timeout"
                    )
                )
            }, timeoutDuration)

            const { reconnectOptions } = this.config
            if (
                !reconnectOptions ||
                this.reconnectAttempts >= reconnectOptions.maxAttempts
            ) {
                this.clearReconnectTimeout()
                this.updateState(ConnectorState.ERROR)
                reject(new Error("Max reconnection attempts reached"))
                return
            }

            try {
                this.updateState(ConnectorState.RECONNECTING)
                this.reconnectAttempts++

                const delay = Math.min(
                    reconnectOptions.delay *
                        Math.pow(2, this.reconnectAttempts - 1),
                    reconnectOptions.maxDelay ?? Infinity
                )

                await new Promise((resolve) => setTimeout(resolve, delay))
                await this.connect()

                this.clearReconnectTimeout()
                this.metrics.reconnects.successes.count++
                this.metrics.reconnects.successes.lastUpdated = Date.now()
                resolve()
            } catch (error) {
                this.clearReconnectTimeout()
                this.metrics.reconnects.failures.count++
                this.metrics.reconnects.failures.lastUpdated = Date.now()

                if (this.reconnectAttempts < reconnectOptions.maxAttempts) {
                    try {
                        await this.handleReconnect()
                        resolve()
                    } catch (retryError) {
                        reject(retryError)
                    }
                } else {
                    this.updateState(ConnectorState.ERROR)
                    reject(error)
                }
            }
        })
    }

    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log("🚀 ~ WebSocketManager ~ 연결 ~")
            if (this.state === ConnectorState.CONNECTED) {
                resolve()
                return
            }

            const timeoutId = setTimeout(() => {
                reject(
                    new WebSocketError(
                        ErrorCode.CONNECTION_TIMEOUT,
                        "Connection timeout"
                    )
                )
            }, this.config.options?.connectionTimeout ?? 30000)

            try {
                this.updateState(ConnectorState.CONNECTING)
                this.client
                    .connect(this.config.url, this.config.options)
                    .then(() => {
                        clearTimeout(timeoutId)
                        resolve()
                    })
                    .catch((error) => {
                        clearTimeout(timeoutId)
                        this.handleError(error)
                        reject(error)
                    })
            } catch (error) {
                clearTimeout(timeoutId)
                this.handleError(error)
                reject(error)
            }
        })
    }

    public async disconnect(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.clearTimers()

            if (this.state === ConnectorState.RECONNECTING) {
                this.reconnectAttempts =
                    this.config.reconnectOptions?.maxAttempts || 0 // 재연결 중지
            }

            this.updateState(ConnectorState.DISCONNECTING)
            try {
                this.client.close()
                resolve()
            } catch (error) {
                this.handleError(error)
                resolve() // 에러가 발생해도 disconnect는 완료로 처리
            }
        })
    }

    public send(data: unknown): void {
        if (this.state !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Cannot send message: WebSocket is not connected"
            )
        }

        try {
            this.client.send(data)
            this.metrics.totalMessages.count++
            this.metrics.totalMessages.lastUpdated = Date.now()
        } catch (error) {
            this.handleError(error)
        }
    }

    private handleOpen(): void {
        console.log("🚀 ~ WebSocketManager ~ handleOpen ~ handleOpen:")
        this.reconnectAttempts = 0
        this.updateState(ConnectorState.CONNECTED)
        this.setupPing()
        this.emit("connected")
    }

    private handleMessage(data: unknown): void {
        if (typeof data === "string") {
            try {
                const message = JSON.parse(data)
                this.processMessage(message)
            } catch (error) {
                this.handleError(
                    new WebSocketError(
                        ErrorCode.MESSAGE_PARSE_ERROR,
                        "Failed to parse message",
                        error as Error
                    )
                )
            }
        } else {
            this.processMessage(data)
        }
    }

    private processMessage(message: unknown): void {
        if (this.isPongMessage(message)) {
            if (this.pongTimer) clearTimeout(this.pongTimer)
            return
        }

        this.metrics.totalMessages.count++
        this.metrics.totalMessages.lastUpdated = Date.now()
        this.emit("message", message)
    }

    private isPongMessage(message: unknown): boolean {
        return (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "pong"
        )
    }

    private handleClose(): void {
        this.clearTimers()

        if (this.state === ConnectorState.RECONNECTING) {
            // 이미 재연결 중이면 무시
            return
        }

        if (this.config.reconnectOptions?.maxAttempts) {
            this.updateState(ConnectorState.RECONNECTING)
            this.handleReconnect().catch((error) => this.handleError(error))
        } else {
            this.updateState(ConnectorState.DISCONNECTED)
            this.emit("disconnected")
        }
    }

    private handleError(error: unknown): void {
        const wsError = this.errorHandler.handleWebSocketError(error)
        this.updateErrorMetrics(wsError, Date.now())

        switch (wsError.severity) {
            case ErrorSeverity.CRITICAL:
                this.handleCriticalError(wsError)
                break
            case ErrorSeverity.HIGH:
                this.handleHighSeverityError(wsError)
                break
            default:
                this.handleNormalError(wsError)
        }

        if (this.state !== ConnectorState.RECONNECTING) {
            this.updateState(ConnectorState.ERROR, { error: wsError })
        }

        this.emit("error", wsError)
    }

    private handleCriticalError(error: WebSocketError): void {
        this.updateState(ConnectorState.ERROR, {
            error,
            isCritical: true,
            needsManualRecovery: true,
        })
        this.clearTimers()
        this.client.close()
    }

    private handleHighSeverityError(error: WebSocketError): void {
        this.updateState(ConnectorState.ERROR, {
            error,
            isRecoverable: true,
        })
    }

    private handleNormalError(error: WebSocketError): void {
        // MEDIUM, LOW 심각도는 현재 상태 유지하면서 에러만 기록
        this.emit("warning", {
            error,
            currentState: this.state,
        })
    }

    private updateErrorMetrics(
        wsError: WebSocketError,
        timestamp: number
    ): void {
        this.metrics.errors.count++
        this.metrics.errors.lastUpdated = timestamp
        this.metrics.errors.byCode[wsError.code]++
        this.metrics.errors.bySeverity[wsError.severity]++
        this.metrics.errors.lastError = {
            code: wsError.code,
            message: wsError.message,
            severity: wsError.severity,
            timestamp,
        }
    }

    public getState(): ConnectorState {
        return this.state
    }

    public getMetricsSnapshot(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics))
    }
    public getMetrics(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics))
    }
    public resetMetrics(): void {
        this.metrics = this.createInitialMetrics()
        this.emit("metricsReset", { timestamp: Date.now() })
    }

    // 디버깅을 위한 추가 메서드
    public simulateMessage(data: unknown): void {
        this.handleMessage(data)
    }
    public simulateConnectionClose(): void {
        this.handleClose()
    }
    public simulateError(error: Error): void {
        this.handleError(error)
    }
}
