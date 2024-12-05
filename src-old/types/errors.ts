/**
 * src/types/errors.ts
 *
 * Error Types
 * - 시스템 전반의 에러 타입 정의
 * - 에러 정책 및 복구 전략
 * - 거래소 어댑터 관련 에러 추가
 */

// 기존 코드는 유지하고 아래 내용을 추가

// 거래소 관련 에러 코드 추가
export type ExchangeErrorCode =
    | "EXCHANGE_NOT_SUPPORTED"
    | "INVALID_SYMBOL"
    | "SUBSCRIPTION_FAILED"
    | "RATE_LIMIT_EXCEEDED"
    | "INVALID_MESSAGE_FORMAT"
    | "WEBSOCKET_CONNECTION_FAILED";

// ErrorCode 타입 확장
export type ErrorCode =
    | "NETWORK"
    | "PROCESS"
    | "MEMORY"
    | "STORAGE"
    | "VALIDATION"
    | "TIMEOUT"
    | ExchangeErrorCode; // 거래소 에러 코드 추가

// 거래소 관련 커스텀 에러 클래스들
export class ExchangeError extends Error {
    constructor(
        public code: ExchangeErrorCode,
        public exchangeId: string,
        message: string
    ) {
        super(message);
        this.name = "ExchangeError";
    }
}

export class UnsupportedExchangeError extends ExchangeError {
    constructor(exchangeId: string) {
        super(
            "EXCHANGE_NOT_SUPPORTED",
            exchangeId,
            `Exchange ${exchangeId} is not supported`
        );
        this.name = "UnsupportedExchangeError";
    }
}

export class InvalidSymbolError extends ExchangeError {
    constructor(exchangeId: string, symbol: string) {
        super(
            "INVALID_SYMBOL",
            exchangeId,
            `Invalid symbol ${symbol} for exchange ${exchangeId}`
        );
        this.name = "InvalidSymbolError";
    }
}

export class SubscriptionError extends ExchangeError {
    constructor(exchangeId: string, symbols: string[], details?: string) {
        super(
            "SUBSCRIPTION_FAILED",
            exchangeId,
            `Failed to subscribe to symbols ${symbols.join(
                ", "
            )} on ${exchangeId}${details ? `: ${details}` : ""}`
        );
        this.name = "SubscriptionError";
    }
}

// 에러 심각도 타입
export type ErrorType =
    | "FATAL" // 시스템 중단이 필요한 심각한 에러
    | "RECOVERABLE" // 자동 복구가 가능한 에러
    | "WARNING" // 처리는 가능하나 주의가 필요한 상태
    | "INFO"; // 정보성 에러 로그

// 복구 전략 타입
export interface RecoveryStrategy {
    name: string;
    maxAttempts: number;
    execute: (error: SystemError) => Promise<void>;
    validate: () => Promise<boolean>;
    cleanup: () => Promise<void>;
}
// 에러 정책 인터페이스
export interface ErrorPolicy {
    maxRetries: number; // 최대 재시도 횟수
    retryInterval: number; // 재시도 간격 (ms)
    propagate: boolean; // 상위 컴포넌트로 전파 여부
    timeout: number; // 에러 처리 타임아웃 (ms)

    // 에러 타입별 처리 정책
    typePolicy: {
        [key in ErrorType]: {
            retry: boolean; // 재시도 여부
            notifyAdmin: boolean; // 관리자 알림 여부
            logLevel: "debug" | "info" | "warn" | "error"; // 로그 레벨
        };
    };

    // 복구 전략
    recoveryStrategies: {
        default: RecoveryStrategy; // 기본 복구 전략
        [key: string]: RecoveryStrategy; // 컴포넌트별 복구 전략
    };
}

// 에러 메트릭 인터페이스
export interface ErrorMetrics {
    // 전체 에러 통계
    totalErrors: number; // 총 에러 수
    recoveredErrors: number; // 복구된 에러 수
    activeErrors: number; // 현재 활성 에러 수

    // 타입별 에러 통계
    errorsByType: {
        [key in ErrorType]: number;
    };

    // 컴포넌트별 에러 통계
    errorsByComponent: Map<
        string,
        {
            total: number;
            recovered: number;
            active: number;
            lastError?: {
                timestamp: number;
                message: string;
            };
        }
    >;

    // 시간별 에러 통계
    errorsByTime: {
        lastMinute: number;
        lastHour: number;
        lastDay: number;
    };

    // 복구 통계
    recoveryMetrics: {
        averageRecoveryTime: number; // 평균 복구 시간 (ms)
        successfulRecoveries: number; // 성공한 복구 시도
        failedRecoveries: number; // 실패한 복구 시도
    };

    // 추가 메타데이터
    metadata: {
        lastUpdated: number;
        systemUptime: number;
    };
}

// 시스템 에러 인터페이스 확장
export interface SystemError {
    id: string;
    code: ErrorCode;
    type: ErrorType;
    module: string;
    message: string;
    timestamp: number;
    stack?: string;
    data?: any;
    error?: Error | ExchangeError; // ExchangeError 추가
    retryable?: boolean;
    exchangeId?: string; // 거래소 관련 에러를 위한 필드 추가
}

// 거래소별 에러 정책
export interface ExchangeErrorPolicy extends ErrorPolicy {
    rateLimitCooldown: number; // 레이트 리밋 초과 시 대기 시간
    symbolValidation: boolean; // 심볼 유효성 검사 수행 여부
    autoReconnect: boolean; // 자동 재연결 시도 여부
    maxReconnectAttempts: number; // 최대 재연결 시도 횟수
}

// 거래소별 에러 메트릭 확장
export interface ExchangeErrorMetrics extends ErrorMetrics {
    errorsByExchange: Map<string, number>;
    rateLimitExceeded: number;
    connectionFailures: number;
    subscriptionFailures: number;
}
