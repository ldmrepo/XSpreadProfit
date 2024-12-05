/**
 * Path: src/types/metrics.ts
 * 전체 메트릭스 타입 통합 정의
 */

interface BaseMetrics {
    timestamp: number;
    status: string;
}

export interface ConnectorMetrics extends BaseMetrics {
    id: string;
    symbols: string[];
    messageCount: number;
    errorCount: number;
    state: ConnectorState;
}

export interface ManagerMetrics extends BaseMetrics {
    totalConnectors: number;
    activeConnectors: number;
    totalMessages: number;
    totalErrors: number;
    connectorMetrics: ConnectorMetrics[];
}

export interface CollectorMetrics extends BaseMetrics {
    uptime: number;
    isRunning: boolean;
    managerMetrics: ManagerMetrics;
}
