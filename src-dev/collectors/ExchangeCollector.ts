/**
 * Path: src/collectors/ExchangeCollector.ts
 * 거래소 데이터 수집의 메인 컨트롤러
 */

import EventEmitter from "events"
import { ICollector } from "./types"
import { ConnectorManager } from "./ConnectorManager"
import { ErrorCode, ErrorSeverity, WebSocketError } from "../errors/types"
import { CollectorMetrics, ManagerMetrics } from "../types/metrics"
import { WebSocketConfig } from "../websocket/types"
import { ErrorHandler, IErrorHandler } from "../errors/ErrorHandler"

interface CollectorEvents {
    error: (error: WebSocketError) => void
    stateChange: (status: string) => void
    managerError: (data: { connectorId: string; error: WebSocketError }) => void
}

export class ExchangeCollector extends EventEmitter implements ICollector {
    private manager: ConnectorManager
    private errorHandler: IErrorHandler
    private isRunning = false
    private startTime?: number

    constructor(
        exchangeName: string,
        private readonly config: WebSocketConfig
    ) {
        super()
        this.errorHandler = new ErrorHandler(
            () => this.stop(),
            (error) => this.emit("error", error)
        )
        this.manager = new ConnectorManager(exchangeName, config)
        this.setupEventHandlers()
    }

    async start(symbols: string[]): Promise<void> {
        if (this.isRunning) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Collector is already running",
                undefined,
                ErrorSeverity.MEDIUM
            )
        }

        try {
            await this.manager.initialize(symbols)
            this.isRunning = true
            this.startTime = Date.now()
            this.emit("stateChange", "Running")
        } catch (error) {
            const wsError = this.errorHandler.handleError(error)
            this.isRunning = false
            throw wsError
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return
        }

        try {
            await this.manager.stop()
            this.isRunning = false
            this.startTime = undefined
            this.emit("stateChange", "Stopped")
        } catch (error) {
            const wsError = this.errorHandler.handleError(error)
            throw wsError
        }
    }

    private setupEventHandlers(): void {
        this.manager.on("connectorError", (data) => {
            this.handleManagerError(data)
        })

        this.manager.on("metricsUpdate", (metrics) => {
            this.handleMetricsUpdate(metrics)
        })

        process.on("uncaughtException", (error) => {
            this.errorHandler.handleFatalError(error)
        })

        process.on("unhandledRejection", (error) => {
            if (error instanceof Error) {
                this.errorHandler.handleFatalError(error)
            }
        })
    }

    private handleMetricsUpdate(metrics: ManagerMetrics): void {
        if (metrics.totalErrors > 0) {
            this.emit("stateChange", "Degraded")
        }
    }
    private handleManagerError(data: {
        connectorId: string
        error: WebSocketError
    }): void {
        this.errorHandler.handleConnectorError(data.connectorId, data.error)
        this.emit("managerError", data)
    }
    async getMetrics(): Promise<CollectorMetrics> {
        return {
            timestamp: Date.now(),
            status: this.isRunning ? "Running" : "Stopped",
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            isRunning: this.isRunning,
            managerMetrics: await this.manager.getMetrics(),
        }
    }
}
