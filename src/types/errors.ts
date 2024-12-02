// src/types/errors.ts

// 시스템 에러 인터페이스
export interface SystemError {
    id: string // 에러 고유 식별자 추가
    code: ErrorCode
    type: ErrorType
    module: string
    message: string
    timestamp: number
    stack?: string // stack trace 추가
    data?: any
    error?: Error
    retryable?: boolean
}

// 에러 정책
export interface ErrorPolicy {
    maxRetries: number
    propagate: boolean
    timeout: number
}

// 복구 전략
export interface RecoveryStrategy {
    execute: (error: SystemError) => Promise<void>
}

// 에러 메트릭
export interface ErrorMetrics {
    totalErrors: number
    recoveredErrors: number
    activeErrors: number
    errorsByType: Map<string, number>
}

// 에러 코드
export type ErrorCode =
    | "NETWORK"
    | "PROCESS"
    | "MEMORY"
    | "STORAGE"
    | "VALIDATION"
    | "TIMEOUT"

// 에러 타입
export type ErrorType = "FATAL" | "RECOVERABLE" | "WARNING"

// 에러 컨텍스트
export interface ErrorContext {
    retryCount: number
    lastRetryTime: number
    recoveryAttempts: number
}
