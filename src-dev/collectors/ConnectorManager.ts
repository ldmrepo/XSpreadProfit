/**
 * Path: src/collectors/ConnectorManager.ts
 * 심볼 그룹별 커넥터 관리자
 */

import { EventEmitter } from "events";
import { IExchangeConnector } from "./types";
import { ExchangeConnector } from "./ExchangeConnector";
import { ConnectorState, StateTransitionEvent } from "../states/types";
import { WebSocketError } from "../errors/types";
import { WebSocketConfig, WebSocketMessage } from "../websocket/types";
import { ManagerMetrics, ConnectorMetrics } from "../types/metrics";

interface ManagerEvents {
    connectorStateChange: (data: {
        connectorId: string;
        event: StateTransitionEvent;
    }) => void;
    connectorError: (data: {
        connectorId: string;
        error: WebSocketError;
    }) => void;
    connectorMessage: (data: {
        connectorId: string;
        message: WebSocketMessage;
    }) => void;
    metricsUpdate: (metrics: ManagerMetrics) => void; // 추가
}

export class ConnectorManager extends EventEmitter {
    private metrics: ManagerMetrics;
    private connectors = new Map<string, IExchangeConnector>();
    private readonly groupSize = 100;

    emit<K extends keyof ManagerEvents>(
        event: K,
        ...args: Parameters<ManagerEvents[K]>
    ): boolean {
        return super.emit(event, ...args);
    }

    on<K extends keyof ManagerEvents>(
        event: K,
        listener: ManagerEvents[K]
    ): this {
        return super.on(event, listener);
    }
    constructor(
        private readonly exchangeName: string,
        private readonly config: WebSocketConfig
    ) {
        super();
    }

    async initialize(symbols: string[]): Promise<void> {
        const groups = this.groupSymbols(symbols);

        groups.forEach((group, index) => {
            const connector = new ExchangeConnector(
                `${this.exchangeName}-${index}`,
                group,
                this.config
            );
            this.setupConnectorHandlers(connector);
            this.connectors.set(connector.getId(), connector);
        });

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
        const startPromises = Array.from(this.connectors.values()).map(
            (connector) => connector.start()
        );

        await Promise.all(startPromises);
    }

    async stop(): Promise<void> {
        const stopPromises = Array.from(this.connectors.values()).map(
            (connector) => connector.stop()
        );

        await Promise.all(stopPromises);
        this.connectors.clear();
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

    protected handleConnectorStateChange(
        connectorId: string,
        event: StateTransitionEvent
    ): void {
        this.emit("connectorStateChange", { connectorId, event });
        this.updateManagerMetrics(); // 상태 변경 시 메트릭 업데이트
    }

    protected handleConnectorError(
        connectorId: string,
        error: WebSocketError
    ): void {
        this.emit("connectorError", { connectorId, error });
        this.updateManagerMetrics(); // 에러 발생 시 메트릭 업데이트
    }

    private handleConnectorMessage(
        connectorId: string,
        message: WebSocketMessage
    ): void {
        this.emit("connectorMessage", { connectorId, message });
        this.updateManagerMetrics();
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

    private getManagerStatus(): string {
        const allConnected = Array.from(this.connectors.values()).every(
            (c) => c.getState() === ConnectorState.SUBSCRIBED
        );
        return allConnected ? "Healthy" : "Degraded";
    }
    getMetrics(): ManagerMetrics {
        const connectorMetrics = Array.from(this.connectors.values()).map((c) =>
            c.getMetrics()
        );

        return {
            timestamp: Date.now(),
            status: this.getManagerStatus(),
            totalConnectors: this.connectors.size,
            activeConnectors: this.getActiveConnectorCount(),
            totalMessages: this.getTotalMessageCount(connectorMetrics), // 메서드명 수정
            totalErrors: this.getTotalErrorCount(connectorMetrics), // 메서드명 수정
            connectorMetrics,
        };
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
