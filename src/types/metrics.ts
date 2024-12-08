/**
 * Path: src/types/metrics.ts
 * 전체 메트릭스 타입 통합 정의
 */

import { ConnectorState } from "../states/types";
import { ErrorCode, ErrorSeverity } from "../errors/types";

// 시계열 메트릭을 위한 기본 타입
export interface TimeSeriesMetric {
    count: number;
    lastUpdated: number;
}

// 에러 메트릭을 위한 타입
interface ErrorMetric extends TimeSeriesMetric {
    byCode: Record<ErrorCode, number>;
    bySeverity: Record<ErrorSeverity, number>;
    lastError?: {
        code: ErrorCode;
        message: string;
        severity: ErrorSeverity;
        timestamp: number;
    };
}

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
// WebSocketManager 메트릭스 타입 정의
export interface WebSocketManagerMetrics {
    totalConnections: number; // 총 연결 시도 수
    successfulConnections: number; // 성공한 연결 수
    failedConnections: number; // 실패한 연결 수
    activeConnections: number; // 활성 연결 수
    totalMessages: number; // 총 메시지 수
    totalErrors: number; // 총 에러 수
    currentState: ConnectorState; // 현재 WebSocketManager의 상태
    lastError?: string; // 마지막 에러 메시지 (optional)
}

// WebSocket 메트릭스
export interface ExtendedWebSocketManagerMetrics {
    // 연결 관련 메트릭
    totalConnections: TimeSeriesMetric; // 총 연결 시도 수
    successfulConnections: TimeSeriesMetric; // 성공한 연결 수
    failedConnections: TimeSeriesMetric; // 실패한 연결 수
    activeConnections: TimeSeriesMetric; // 현재 활성 연결 수

    // 메시지 관련 메트릭
    totalMessages: TimeSeriesMetric; // 총 메시지 수

    // 에러 관련 메트릭
    errors: ErrorMetric; // 에러 통계

    // 상태 관련 메트릭
    currentState: {
        state: ConnectorState; // 현재 상태
        since: number; // 현재 상태 시작 시간
    };

    // 재연결 관련 메트릭
    reconnects: {
        attempts: TimeSeriesMetric; // 재연결 시도 횟수
        successes: TimeSeriesMetric; // 재연결 성공 횟수
        failures: TimeSeriesMetric; // 재연결 실패 횟수
        lastAttempt?: {
            // 마지막 재연결 시도 정보
            timestamp: number; // 시도 시간
            success: boolean; // 성공 여부
            duration: number; // 소요 시간
        };
    };
}
