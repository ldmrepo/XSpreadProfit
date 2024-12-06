/**
 * Path: src/collectors/ExchangeConnector.ts
 * 개별 웹소켓 연결 및 메시지 처리 담당
 */

import { EventEmitter } from "events"
import { WebSocketManager } from "../websocket/WebSocketManager"
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types"
import {
    ConnectorState,
    StateChangeEvent,
    StateTransitionEvent,
    validStateTransitions, // validStateTransitions 추가
} from "../states/types"
import { IExchangeConnector, SymbolGroup } from "./types"
import { WebSocketConfig, WebSocketMessage } from "../websocket/types"
import { ConnectorMetrics } from "../types/metrics"
import { ErrorHandler, IErrorHandler } from "../errors/ErrorHandler"

interface ConnectorEvents {
    stateChange: (event: StateTransitionEvent) => void
    error: (error: WebSocketError) => void
    message: (data: WebSocketMessage) => void
}

export class ExchangeConnector
    extends EventEmitter
    implements IExchangeConnector
{
    protected errorHandler: IErrorHandler
    protected state: ConnectorState = ConnectorState.INITIAL
    protected metrics: ConnectorMetrics
    protected stateTimestamp: number

    constructor(
        protected readonly id: string,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: WebSocketManager // WebSocketManager를 외부에서 주입받도록 수정
    ) {
        super()
        this.stateTimestamp = Date.now()
        this.errorHandler = new ErrorHandler(
            async () => this.handleFatalError(),
            (error) => this.emit("error", error)
        )
        this.metrics = this.initializeMetrics()
        this.setupEventHandlers()
    }

    private initializeMetrics(): ConnectorMetrics {
        return {
            timestamp: Date.now(),
            status: this.state,
            messageCount: 0,
            errorCount: 0,
            id: this.id,
            symbols: this.symbols,
            state: this.state,
        }
    }

    private setupEventHandlers(): void {
        this.wsManager.on("message", this.handleMessage.bind(this))
        this.wsManager.on("error", (error) => {
            this.handleError(error)
        })
    }

    async start(): Promise<void> {
        if (this.state !== ConnectorState.INITIAL) {
            throw this.errorHandler.handleError(
                new WebSocketError(
                    ErrorCode.INVALID_STATE,
                    "Connector can only be started from INITIAL state",
                    undefined,
                    ErrorSeverity.HIGH
                )
            )
        }

        try {
            this.setState(ConnectorState.CONNECTING)
            await this.wsManager.connect()

            // 연결 후 CONNECTED 상태로 전환
            this.setState(ConnectorState.CONNECTED)

            await this.subscribe()
        } catch (error) {
            console.error("Error during start:", error) // 에러 로그 추가
            this.setState(ConnectorState.ERROR) // 에러 발생 시 상태 전환
            throw this.errorHandler.handleError(error)
        }
    }

    async stop(): Promise<void> {
        try {
            await this.wsManager.disconnect()
            this.setState(ConnectorState.DISCONNECTED)
        } catch (error) {
            this.setState(ConnectorState.ERROR)
            throw this.errorHandler.handleError(error)
        }
    }

    protected async subscribe(): Promise<void> {
        this.setState(ConnectorState.SUBSCRIBING)

        try {
            this.symbols.forEach((symbol) => {
                this.wsManager.send({
                    type: "subscribe",
                    symbol,
                })
            })
            this.setState(ConnectorState.SUBSCRIBED)
        } catch (error) {
            throw this.errorHandler.handleError(
                new WebSocketError(
                    ErrorCode.SUBSCRIPTION_FAILED,
                    "Failed to subscribe to symbols",
                    error as Error,
                    ErrorSeverity.HIGH
                )
            )
        }
    }

    protected updateState(newState: ConnectorState): void {
        const previousState = this.state // currentState -> state
        this.state = newState // currentState -> state
        this.stateTimestamp = Date.now()
        this.metrics.state = newState

        this.emit("stateChange", {
            id: this.getId(),
            previousState,
            currentState: newState,
            timestamp: this.stateTimestamp,
        })
    }
    private isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean {
        return validStateTransitions[from]?.includes(to) ?? false
    }
    public setState(newState: ConnectorState): void {
        try {
            // 같은 상태로의 전이는 무시
            if (this.state === newState) {
                return
            }
            if (!this.isValidStateTransition(this.state, newState)) {
                throw new WebSocketError(
                    ErrorCode.INVALID_STATE,
                    `Invalid state transition from ${this.state} to ${newState}`,
                    undefined,
                    ErrorSeverity.HIGH
                )
            }

            const previousState = this.state
            this.state = newState
            this.stateTimestamp = Date.now()

            const event: StateTransitionEvent = {
                id: this.getId(),
                previousState,
                currentState: newState,
                timestamp: this.stateTimestamp,
            }

            this.emit("stateChange", event)
            this.updateMetrics()
        } catch (error) {
            this.errorHandler.handleError(error)
        }
    }

    protected handleMessage(data: unknown): void {
        try {
            if (this.isValidMessage(data)) {
                this.metrics.messageCount++
                this.emit("message", data)
            } else {
                console.warn("Invalid message detected:", data)
                throw new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    "Invalid message format",
                    undefined,
                    ErrorSeverity.LOW
                )
            }
        } catch (error) {
            console.error("Error while handling message:", error)
            this.handleError(error) // 에러 카운트 증가 확인
        }
    }

    protected isValidMessage(data: unknown): data is WebSocketMessage {
        return (
            typeof data === "object" &&
            data !== null &&
            "type" in data &&
            typeof (data as WebSocketMessage).type === "string"
        )
    }

    protected handleError(error: unknown): void {
        this.metrics.errorCount++
        const wsError = this.errorHandler.handleWebSocketError(error)
        this.setState(ConnectorState.ERROR)
        this.emit("error", wsError)
    }
    protected async handleFatalError(): Promise<void> {
        try {
            await this.stop()
        } catch (error) {
            console.error("Failed to stop after fatal error:", error)
        }
    }

    private updateMetrics(): void {
        this.metrics.timestamp = Date.now()
        this.metrics.status = this.state
        this.metrics.state = this.state
    }

    getId(): string {
        return this.id
    }

    getState(): ConnectorState {
        return this.state
    }

    getMetrics(): ConnectorMetrics {
        return {
            ...this.metrics,
            timestamp: Date.now(),
        }
    }
}
