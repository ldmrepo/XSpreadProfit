/**
 * Path: src/collectors/ConnectorManager.ts
 * 심볼 그룹별 커넥터 관리자
 */

import { EventEmitter } from "events";
import { IExchangeConnector } from "./types";
import { ConnectorState, StateTransitionEvent } from "../states/types";
import { WebSocketError } from "../errors/types";
import { WebSocketConfig, WebSocketMessage } from "../websocket/types";
import { ManagerMetrics, ConnectorMetrics } from "../types/metrics";
import { ErrorHandler, IErrorHandler } from "../errors/ErrorHandler";

export class ConnectorManager extends EventEmitter {
    // private metrics: ManagerMetrics
    private errorHandler: IErrorHandler;
    private connectors = new Map<string, IExchangeConnector>();
    private readonly groupSize = 100;

    constructor(
        private readonly exchangeName: string,
        private readonly config: WebSocketConfig,
        private readonly createConnector: (
            id: string,
            symbols: string[],
            config: WebSocketConfig
        ) => IExchangeConnector // 생성 함수 주입
    ) {
        super();
        this.errorHandler = new ErrorHandler(
            async () => this.handleFatalError(),
            (error) =>
                this.emit("connectorError", {
                    connectorId: "manager",
                    error,
                })
        );
    }

    async initialize(symbols: string[]): Promise<void> {
        try {
            const groups = this.groupSymbols(symbols);
            await this.initializeConnectors(groups);
        } catch (error) {
            throw this.errorHandler.handleError(error);
        }
    }

    private async initializeConnectors(groups: string[][]): Promise<void> {
        for (const [index, group] of groups.entries()) {
            const connector = this.createConnector(
                `${this.exchangeName}-${index}`,
                group,
                this.config
            );
            this.setupConnectorHandlers(connector);
            this.connectors.set(connector.getId(), connector);
        }

        await this.startAllConnectors();
    }

    private setupConnectorHandlers(connector: IExchangeConnector): void {
        connector.on("stateChange", (event: StateTransitionEvent) => {
            this.handleConnectorStateChange(connector.getId(), event);
        });

        connector.on("error", (error: WebSocketError) => {
            this.handleConnectorError(connector.getId(), error);
        });

        connector.on("message", (message: WebSocketMessage) => {
            this.handleConnectorMessage(connector.getId(), message);
        });
    }

    private async startAllConnectors(): Promise<void> {
        try {
            await Promise.all(
                Array.from(this.connectors.values()).map((c) => c.start())
            );
        } catch (error) {
            throw this.errorHandler.handleError(error);
        }
    }

    async stop(): Promise<void> {
        try {
            await Promise.all(
                Array.from(this.connectors.values()).map((c) => c.stop())
            );
            this.connectors.clear();
        } catch (error) {
            throw this.errorHandler.handleError(error);
        }
    }

    private groupSymbols(symbols: string[]): string[][] {
        return symbols.reduce((groups: string[][], symbol) => {
            const lastGroup = groups[groups.length - 1];

            if (!lastGroup || lastGroup.length >= this.groupSize) {
                groups.push([symbol]);
            } else {
                lastGroup.push(symbol);
            }

            return groups;
        }, []);
    }

    private handleConnectorStateChange(
        connectorId: string,
        event: StateTransitionEvent
    ): void {
        this.emit("connectorStateChange", { connectorId, event });
        this.updateManagerMetrics();
    }
    private handleConnectorError(
        connectorId: string,
        error: WebSocketError
    ): void {
        this.errorHandler.handleConnectorError(connectorId, error);
    }

    private handleConnectorMessage(
        connectorId: string,
        message: WebSocketMessage
    ): void {
        this.emit("connectorMessage", { connectorId, message });
    }

    private async handleFatalError(): Promise<void> {
        try {
            await this.stop();
        } catch (error) {
            console.error("Failed to stop after fatal error:", error);
        }
    }

    private updateManagerMetrics(): void {
        const currentMetrics = this.calculateMetrics();
        this.emit("metricsUpdate", currentMetrics);
    }
    private calculateMetrics(): ManagerMetrics {
        const connectorMetrics = Array.from(this.connectors.values()).map((c) =>
            c.getMetrics()
        );

        return {
            timestamp: Date.now(),
            status: this.calculateManagerStatus(),
            totalConnectors: this.connectors.size,
            activeConnectors: this.countActiveConnectors(),
            totalMessages: this.getTotalMessageCount(connectorMetrics), // 메서드명 수정
            totalErrors: this.getTotalErrorCount(connectorMetrics), // 메서드명 수정
            connectorMetrics,
        };
    }

    private countActiveConnectors(): number {
        return Array.from(this.connectors.values()).filter(
            (c) => c.getState() === ConnectorState.SUBSCRIBED
        ).length;
    }
    private calculateManagerStatus(): string {
        const states = Array.from(this.connectors.values()).map((c) =>
            c.getState()
        );

        if (states.every((state) => state === ConnectorState.SUBSCRIBED)) {
            return "Healthy";
        }
        if (states.some((state) => state === ConnectorState.ERROR)) {
            return "Degraded";
        }
        return "Partial";
    }
    getConnectorIds(): string[] {
        return Array.from(this.connectors.keys());
    }

    getConnector(id: string): IExchangeConnector | undefined {
        return this.connectors.get(id);
    }

    getMetrics(): ManagerMetrics {
        try {
            return this.calculateMetrics();
        } catch (error) {
            this.errorHandler.handleError(error);
            throw error;
        }
    }
    private getTotalMessageCount(metrics: ConnectorMetrics[]): number {
        return metrics.reduce((sum, m) => sum + m.messageCount, 0);
    }

    private getTotalErrorCount(metrics: ConnectorMetrics[]): number {
        return metrics.reduce((sum, m) => sum + m.errorCount, 0);
    }
    private getActiveConnectorCount(): number {
        return Array.from(this.connectors.values()).filter(
            (c) => c.getState() === ConnectorState.SUBSCRIBED
        ).length;
    }
}
