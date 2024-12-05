/**
 * Path: src/errors/types.ts
 * 웹소켓 관련 에러 타입 정의
 */

export enum ErrorCode {
    // 연결 관련
    CONNECTION_FAILED = "CONNECTION_FAILED",
    CONNECTION_CLOSED = "CONNECTION_CLOSED",
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",

    // 메시지 관련
    MESSAGE_PARSE_ERROR = "MESSAGE_PARSE_ERROR",
    SEND_FAILED = "SEND_FAILED",

    // 구독 관련
    SUBSCRIPTION_FAILED = "SUBSCRIPTION_FAILED",
    UNSUBSCRIPTION_FAILED = "UNSUBSCRIPTION_FAILED",

    // 상태 관련
    INVALID_STATE = "INVALID_STATE",
}

export class WebSocketError extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "WebSocketError";
    }

    toString(): string {
        return `${this.name}[${this.code}]: ${this.message}`;
    }
}
