/**
 * Path: src/collectors/ExchangeCollector.ts
 * 거래소 데이터 수집의 메인 컨트롤러
 */

import { ICollector, Metrics } from "./types";
import { ConnectorManager } from "./ConnectorManager";
import { WebSocketError } from "../errors/types";
import { CollectorMetrics } from "../types/metrics";
import { WebSocketConfig } from "../websocket/types";

export class ExchangeCollector implements ICollector {
    private manager: ConnectorManager;
    private isRunning = false;
    private startTime?: number;

    constructor(
        exchangeName: string,
        private readonly config: WebSocketConfig
    ) {
        this.manager = new ConnectorManager(exchangeName, config);
        this.setupErrorHandling();
    }

    private setupErrorHandling(): void {
        process.on("uncaughtException", this.handleFatalError.bind(this));
        process.on("unhandledRejection", this.handleFatalError.bind(this));
    }

    async start(symbols: string[]): Promise<void> {
        if (this.isRunning) {
            throw new Error("Collector is already running");
        }

        try {
            await this.manager.initialize(symbols);
            this.isRunning = true;
            this.startTime = Date.now();
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
        console.error("Failed to start collector:", error);
        this.isRunning = false;
    }

    private handleShutdownError(error: unknown): void {
        console.error("Error during shutdown:", error);
    }

    private handleFatalError(error: Error): void {
        console.error("Fatal error occurred:", error);
        this.stop().catch(console.error);
    }
}
