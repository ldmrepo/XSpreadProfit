// src/types/metrics.ts

// 메트릭 기본 인터페이스
export interface Metric {
    type: MetricType
    module: string
    name: string
    value: number
    timestamp: number
    tags?: Record<string, string>
}
export interface Metrics {
    eventsProcessed: number
    eventsFailed: number
    averageProcessingTime: number
}

// 메트릭 값
export interface MetricValue {
    value: number
    timestamp: number
}

// 메트릭 쿼리
export interface MetricQuery {
    type: string
    module: string
    name: string
    startTime?: number
    endTime?: number
    aggregation?: AggregationType
}

// 집계 결과
export interface AggregateResult {
    count: number
    sum: number
    avg: number
    min: number
    max: number
}

// 시스템 메트릭
export interface SystemMetrics {
    totalProcessedEvents: number
    errorRate: number
    memoryUsage: number
    uptime: number
    componentMetrics: Record<string, ComponentMetrics>
}

// 컴포넌트 메트릭
export interface ComponentMetrics {
    processedCount: number
    errorCount: number
    latency: number
    lastProcessedTime: number
}

// 메트릭 타입
export enum MetricType {
    COUNTER = "COUNTER",
    GAUGE = "GAUGE",
    HISTOGRAM = "HISTOGRAM",
}

// 집계 타입
export type AggregationType = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT"
