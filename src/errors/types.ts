/**
 * Path: src/errors/types.ts
 * 웹소켓 관련 에러 타입 정의
 */

export enum ErrorCode {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    CONNECTION_CLOSED = "CONNECTION_CLOSED",
    CONNECTION_ERROR = "CONNECTION_ERROR", // 추가
    SUBSCRIPTION_FAILED = "SUBSCRIPTION_FAILED",
    UNSUBSCRIPTION_FAILED = "UNSUBSCRIPTION_FAILED",
    MESSAGE_PARSE_ERROR = "MESSAGE_PARSE_ERROR",
    INVALID_STATE = "INVALID_STATE",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    SEND_FAILED = "SEND_FAILED",
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
    MOCK_ERROR = "MOCK_ERROR", // 테스트용 에러 코드 추가
    RECOVERY_ABORTED = "RECOVERY_ABORTED",
    RECOVERY_VALIDATION_FAILED = "RECOVERY_VALIDATION_FAILED",
    SUBSCRIPTION_VALIDATION_FAILED = "SUBSCRIPTION_VALIDATION_FAILED",
}

export enum ErrorSeverity {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL",
}

export class WebSocketError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly originalError?: Error,
        public readonly severity: ErrorSeverity = ErrorSeverity.MEDIUM
    ) {
        super(message);
        this.name = "WebSocketError";
    }

    toString(): string {
        return `${this.name}[${this.code}]: ${this.message}`;
    }
}
