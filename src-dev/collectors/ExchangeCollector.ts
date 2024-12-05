/**
 * Path: src/collectors/ExchangeCollector.ts
 * 거래소 데이터 수집의 메인 컨트롤러
 */

import { ICollector, Metrics } from "./types";
import { ConnectorManager } from "./ConnectorManager";
import { ErrorCode, WebSocketError } from "../errors/types";
import { CollectorMetrics, ManagerMetrics } from "../types/metrics";
import { WebSocketConfig } from "../websocket/types";
import EventEmitter from "events";

interface CollectorEvents {
    error: (error: WebSocketError) => void;
    stateChange: (status: string) => void;
    managerError: (data: {
        connectorId: string;
        error: WebSocketError;
    }) => void;
}

export class ExchangeCollector extends EventEmitter implements ICollector {
    private manager: ConnectorManager;
    private isRunning = false;
    private startTime?: number;

    constructor(
        exchangeName: string,
        private readonly config: WebSocketConfig
    ) {
        super();
        this.manager = new ConnectorManager(exchangeName, config);
        this.setupEventHandlers();
    }

    private setupErrorHandling(): void {
        process.on("uncaughtException", this.handleFatalError.bind(this));
        process.on("unhandledRejection", this.handleFatalError.bind(this));
    }

    private setupEventHandlers(): void {
        // ConnectorManager 이벤트 구독
        this.manager.on("connectorError", (data) => {
            this.handleManagerError(data);
        });

        this.manager.on("metricsUpdate", (metrics) => {
            this.handleMetricsUpdate(metrics);
        });

        // 프로세스 레벨 에러 처리
        process.on("uncaughtException", this.handleFatalError.bind(this));
        process.on("unhandledRejection", this.handleFatalError.bind(this));
    }

    private handleMetricsUpdate(metrics: ManagerMetrics): void {
        if (metrics.totalErrors > 0) {
            this.emit("stateChange", "Degraded");
        }
    }
    private handleManagerError(data: {
        connectorId: string;
        error: WebSocketError;
    }): void {
        this.emit("managerError", data);

        // 심각한 에러인 경우 전체 시스템에 영향
        if (this.isCriticalError(data.error)) {
            this.handleCriticalError(data.error);
        }
    }

    private isCriticalError(error: WebSocketError): boolean {
        // 심각한 에러 조건 정의
        return (
            error.code === ErrorCode.CONNECTION_FAILED ||
            error.code === ErrorCode.INVALID_STATE
        );
    }
    private handleCriticalError(error: WebSocketError): void {
        this.emit("error", error);
        this.stop().catch((e) => {
            console.error("Failed to stop after critical error:", e);
        });
    }

    async start(symbols: string[]): Promise<void> {
        if (this.isRunning) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Collector is already running"
            );
        }

        try {
            await this.manager.initialize(symbols);
            this.isRunning = true;
            this.startTime = Date.now();
            this.emit("stateChange", "Running");
        } catch (error) {
            this.handleStartupError(error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            await this.manager.stop();
            this.isRunning = false;
            this.startTime = undefined;
        } catch (error) {
            this.handleShutdownError(error);
            throw error;
        }
    }

    async getMetrics(): Promise<CollectorMetrics> {
        return {
            timestamp: Date.now(),
            status: this.isRunning ? "Running" : "Stopped",
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            isRunning: this.isRunning,
            managerMetrics: await this.manager.getMetrics(),
        };
    }

    private handleStartupError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.CONNECTION_FAILED,
                      "Failed to start collector",
                      error instanceof Error ? error : undefined
                  );

        this.emit("error", wsError);
        this.isRunning = false;
    }

    private handleShutdownError(error: unknown): void {
        console.error("Error during shutdown:", error);
    }

    private handleFatalError(error: Error): void {
        const wsError = new WebSocketError(
            ErrorCode.CONNECTION_FAILED,
            "Fatal error occurred",
            error
        );

        this.emit("error", wsError);
        this.stop().catch(console.error);
    }
}
