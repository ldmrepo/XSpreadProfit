import { CollectorMetrics, ConnectorMetrics, ManagerMetrics } from "metrics";
import { IExchangeConnector } from "./types";
import { ConnectorState } from "../states/types";

export class ExchangeCollector {
    private groupedSymbols: string[][] = [];
    private totalSymbols: number;
    private currentState: "Ready" | "Running" | "Stopped" = "Ready";
    private exchangeConnector: IExchangeConnector[] = [];
    private startTime: number;

    constructor(
        private readonly exchangeFactory: (
            id: string,
            symbols: string[]
        ) => IExchangeConnector,
        private readonly symbols: string[],
        private readonly config: { streamLimitPerConnection: number }
    ) {
        this.totalSymbols = symbols.length;
        this.startTime = Date.now();
        this.initialize();
    }

    private initialize() {
        console.log("[ExchangeCollector] Initializing collector");
        // 심볼 그룹화
        this.groupedSymbols = this.symbols.reduce((acc, symbol, index) => {
            const groupIndex = Math.floor(
                index / this.config.streamLimitPerConnection
            );
            if (!acc[groupIndex]) {
                acc[groupIndex] = [];
            }
            acc[groupIndex].push(symbol);
            return acc;
        }, [] as string[][]);

        // 각 그룹별 커넥터 생성
        this.exchangeConnector = this.groupedSymbols.map((symbols, index) => {
            const connector = this.exchangeFactory(
                `connector-${index}`,
                symbols
            );

            // 이벤트 리스너 설정
            connector.on("error", (error) => {
                console.error(`Connector-${index} error:`, error);
                this.handleConnectorError(index, error);
            });

            return connector;
        });
    }

    private handleConnectorError(connectorIndex: number, error: Error): void {
        console.error(`Connector-${connectorIndex} error:`, error);
        // 필요한 경우 해당 커넥터만 재시작
        if (this.currentState === "Running") {
            this.restartConnector(connectorIndex);
        }
    }

    private async restartConnector(index: number): Promise<void> {
        try {
            await this.exchangeConnector[index].stop();
            await this.exchangeConnector[index].start();
            console.log(`Connector-${index} successfully restarted`);
        } catch (error) {
            console.error(`Failed to restart Connector-${index}:`, error);
        }
    }

    public async start(): Promise<void> {
        console.log(
            "🚀 ~ ExchangeCollector ~ start ~ this.currentState:",
            this.currentState
        );
        this.currentState = "Running";

        await Promise.all(
            this.exchangeConnector.map(async (connector, index) => {
                try {
                    await connector.start();
                    console.log(`Connector-${index} started successfully`);
                } catch (error) {
                    console.error(`Failed to start Connector-${index}:`, error);
                    throw error;
                }
            })
        );
    }

    public async stop(): Promise<void> {
        console.log("[ExchangeCollector] Stopping collection");
        this.currentState = "Stopped";

        await Promise.all(
            this.exchangeConnector.map(async (connector, index) => {
                try {
                    await connector.stop();
                    console.log(`Connector-${index} stopped successfully`);
                } catch (error) {
                    console.error(`Failed to stop Connector-${index}:`, error);
                    throw error;
                }
            })
        );
    }

    public getCurrentState(): string {
        return this.currentState;
    }

    public getMetrics(): CollectorMetrics {
        const now = Date.now();

        // 각 커넥터의 메트릭스 수집
        const connectorMetrics: ConnectorMetrics[] = this.exchangeConnector.map(
            (connector) => {
                const metrics = connector.getMetrics();
                return {
                    id: connector.getId(),
                    symbols:
                        this.groupedSymbols[
                            this.exchangeConnector.indexOf(connector)
                        ],
                    timestamp: now,
                    status: connector.getState(),
                    messageCount: metrics.messageCount,
                    errorCount: metrics.errorCount,
                    state: metrics.state,
                };
            }
        );

        // Manager 메트릭스 계산
        const managerMetrics: ManagerMetrics = {
            timestamp: now,
            status: this.currentState,
            totalConnectors: this.exchangeConnector.length,
            activeConnectors: connectorMetrics.filter(
                (m) => m.state === ConnectorState.SUBSCRIBED
            ).length,
            totalMessages: connectorMetrics.reduce(
                (sum, m) => sum + m.messageCount,
                0
            ),
            totalErrors: connectorMetrics.reduce(
                (sum, m) => sum + m.errorCount,
                0
            ),
            connectorMetrics,
            reconnectingConnectors: 0,
        };

        // Collector 메트릭스 생성
        const collectorMetrics: CollectorMetrics = {
            timestamp: now,
            status: this.currentState,
            uptime: now - this.startTime, // startTime은 클래스에 추가 필요
            isRunning: this.currentState === "Running",
            managerMetrics,
        };

        return collectorMetrics;
    }

    public getConnectorStates(): Array<{
        id: string;
        state: string;
        symbols: string[];
    }> {
        return this.exchangeConnector.map((connector, index) => ({
            id: connector.getId(),
            state: connector.getState(),
            symbols: this.groupedSymbols[index],
        }));
    }
}
