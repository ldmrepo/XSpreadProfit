/**
 * Path: src/collectors/ConnectorManager.ts
 * 심볼 그룹별 커넥터 관리자
 */

import { IExchangeConnector, ManagerMetrics } from "./types";
import { ExchangeConnector } from "./ExchangeConnector";
import { ConnectorState, StateTransitionEvent } from "../states/types";
import { WebSocketError } from "../errors/types";
import { WebSocketConfig, WebSocketMessage } from "../websocket/types";

export class ConnectorManager {
    private metrics: ManagerMetrics;
    private connectors = new Map<string, IExchangeConnector>();
    private readonly groupSize = 100;

    constructor(
        private readonly exchangeName: string,
        private readonly config: WebSocketConfig
    ) {}

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
        connector.on("error", (error: WebSocketError) => {
            this.handleConnectorError(connector.getId(), error);
            this.emit("connectorError", {
                connectorId: connector.getId(),
                error,
            });
        });

        connector.on("stateChange", (event: StateTransitionEvent) => {
            this.handleConnectorStateChange(connector.getId(), event);
            this.emit("connectorStateChange", {
                connectorId: connector.getId(),
                event,
            });
        });

        connector.on("message", (message: WebSocketMessage) => {
            this.handleMessage(connector.getId(), message);
        });
    }

    private handleMessage(
        connectorId: string,
        message: WebSocketMessage
    ): void {
        // 메시지 처리 및 상위로 전파
        this.emit("message", { connectorId, message });
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

    private handleConnectorError(id: string, error: WebSocketError): void {
        console.error(`Connector ${id} error:`, error);
    }

    private handleConnectorStateChange(id: string, event: any): void {
        console.log(`Connector ${id} state change:`, event);
    }

    getConnectorIds(): string[] {
        return Array.from(this.connectors.keys());
    }

    getConnector(id: string): IExchangeConnector | undefined {
        return this.connectors.get(id);
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
            totalMessages: this.getTotalMessages(connectorMetrics),
            totalErrors: this.getTotalErrors(connectorMetrics),
            connectorMetrics,
        };
    }
    private getActiveConnectorCount(): number {
        return Array.from(this.connectors.values()).filter(
            (c) => c.getState() === ConnectorState.SUBSCRIBED
        ).length;
    }

    private getTotalMessageCount(metrics: any[]): number {
        return metrics.reduce((sum, m) => sum + m.messageCount, 0);
    }

    private getTotalErrorCount(metrics: any[]): number {
        return metrics.reduce((sum, m) => sum + m.errorCount, 0);
    }
}
