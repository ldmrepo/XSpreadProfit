/**
 * Path: src/collectors/types.ts
 * 수집기 관련 공통 타입 정의
 */

export type SymbolGroup = string[];
export type ConnectorId = string;

export interface ICollector {
    start(symbols: string[]): Promise<void>;
    stop(): Promise<void>;
    getMetrics(): Promise<Metrics>;
}

export interface IConnectorManager {
    initialize(symbols: string[]): Promise<void>;
    stop(): Promise<void>;
    getMetrics(): ManagerMetrics;
}

export interface IExchangeConnector {
    start(): Promise<void>;
    stop(): Promise<void>;
    getId(): string;
    getState(): string;
    getMetrics(): ConnectorMetrics;
}

export interface Metrics {
    timestamp: number;
    status: string;
    messageCount: number;
    errorCount: number;
    uptime?: number;
    isRunning?: boolean;
}

export interface ManagerMetrics extends Metrics {
    totalConnectors: number;
    activeConnectors: number;
}

export interface ConnectorMetrics extends Metrics {
    id: string;
    symbols: string[];
}
