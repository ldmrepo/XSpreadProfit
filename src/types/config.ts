// src/types/config.ts

import EventFilter from "events"
import ErrorManager from "../managers/ErrorManager"
import EventManager from "../managers/EventManager"
import MetricManager from "../managers/MetricManager"
import StateManager from "../managers/StateManager"
import { ErrorPolicy } from "errors"

// 시스템 설정
export interface SystemConfig {
    name: string
    version: string
    redis: RedisConfig
    exchanges: ExchangeConfig[]
    collector: CollectorConfig
    processor: ProcessorConfig

    // 매니저 설정들
    eventManager: EventManagerConfig
    stateManager: StateManagerConfig
    metricManager: MetricManagerConfig
    errorManager: ErrorManagerConfig
}

// Redis 설정
export interface RedisConfig {
    host: string
    port: number
    password?: string
    db?: number
    keyPrefix?: string
}

// 거래소 설정
export interface ExchangeConfig {
    id: string
    name: string
    websocketUrl: string
    restUrl: string
    symbols: string[]
    apiKey: string
    apiSecret: string
    options?: Record<string, any>
}

// 수집기 설정
export interface CollectorConfig {
    id: string
    exchangeId: string
    websocketUrl: string
    managers: ManagerDependencies
    wsConfig?: WebSocketConfig
    bufferConfig?: SharedBufferConfig
    retryPolicy: RetryPolicy
}

// 등록기 설정
export interface ProcessorConfig {
    id: string
    exchangeId: string
    memoryLimit: number
    redisConfig: RedisConfig
    // managers: ManagerDependencies
    batchConfig?: SharedBufferConfig
    memoryConfig?: MemoryConfig
}
// 이벤트 관리자 설정
export interface EventManagerConfig {
    // EventRegistryConfig에서 변경
    retryPolicy: RetryPolicy
    eventTypes?: string[]
    eventFilters?: Record<string, EventFilter>
    subscriptionTimeout?: number
    maxSubscribersPerEvent?: number
}
// 상태 관리자 설정
export interface StateManagerConfig {
    stateHistoryLimit?: number
    stateTransitionRules?: Map<string, Set<string>>
    validationEnabled?: boolean
    stateChangeTimeout?: number
}
// 메트릭 관리자 설정
export interface MetricManagerConfig {
    // MetricsConfig에서 변경
    redisConfig: RedisConfig // Redis 설정 추가
    enabled: boolean
    flushInterval: number
    retentionPeriod: number
    alertThresholds?: {
        errorRate: number
        latency: number
        memoryUsage: number
    }
}
// 에러 관리자 설정
export interface ErrorManagerConfig {
    redisConfig: RedisConfig // Redis 설정 추가
    maxErrorHistory?: number
    errorPolicies?: Map<string, ErrorPolicy>
    notificationConfig?: {
        enabled: boolean
        channels: string[]
    }
}

// 매니저 의존성
export interface ManagerDependencies {
    eventManager: EventManager
    stateManager: StateManager
    metricManager: MetricManager
    errorManager: ErrorManager
}

// WebSocket 설정
export interface WebSocketConfig {
    maxReconnectAttempts: number
    reconnectInterval: number
    pingInterval: number
    pongTimeout: number
}

// 버퍼 설정
export interface BufferConfig {
    size: number
    flushInterval: number
}

// 배치 설정
// export interface BatchConfig {
//     size: number
//     timeout: number
// }

// 메모리 설정
export interface MemoryConfig {
    poolSize: number
    bufferSize: number
}

// 메트릭 설정
export interface MetricsConfig {
    enabled: boolean
    flushInterval: number
    retentionPeriod: number
}
export interface RetryPolicy {
    maxRetries: number // 최대 재시도 횟수
    retryInterval: number // 재시도 간격 (ms)
    backoffRate: number // 재시도 간격 증가율
}

export interface SharedBufferConfig {
    maxSize: number
    flushThreshold: number
    flushInterval: number
    retryAttempts?: number
    retryDelay?: number
}
