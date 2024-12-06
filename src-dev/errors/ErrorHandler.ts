/**
 * Path: src/errors/ErrorHandler.ts
 */

import { WebSocketError, ErrorCode, ErrorSeverity } from "./types"

export interface IErrorHandler {
    handleError(error: unknown): WebSocketError
    handleFatalError(error: Error): void
    handleConnectorError(connectorId: string, error: WebSocketError): void
    handleWebSocketError(error: unknown): WebSocketError
}

export class ErrorHandler implements IErrorHandler {
    constructor(
        private readonly onFatalError: () => Promise<void>,
        private readonly onError: (error: WebSocketError) => void
    ) {}

    handleError(error: unknown): WebSocketError {
        const wsError = this.normalizeError(error)
        this.onError(wsError)
        return wsError
    }

    handleFatalError(error: Error): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Fatal error occurred",
                      error,
                      ErrorSeverity.CRITICAL
                  )
        this.onError(wsError)
        this.onFatalError().catch(console.error)
    }

    handleConnectorError(connectorId: string, error: WebSocketError): void {
        if (this.isCriticalError(error)) {
            this.handleFatalError(error)
        } else {
            this.onError(error)
        }
    }

    handleWebSocketError(error: unknown): WebSocketError {
        return this.normalizeError(error)
    }

    private normalizeError(error: unknown): WebSocketError {
        if (error instanceof WebSocketError) {
            return error // 이미 WebSocketError라면 그대로 반환
        }

        if (error instanceof Error) {
            return new WebSocketError(
                ErrorCode.INTERNAL_ERROR,
                error.message,
                error,
                ErrorSeverity.MEDIUM // 기본 심각도 설정
            )
        }

        console.warn("Unknown error type received:", error) // 예상치 못한 에러 로그
        // 알 수 없는 에러 처리
        return new WebSocketError(
            ErrorCode.INTERNAL_ERROR,
            "Unknown error occurred",
            undefined,
            ErrorSeverity.LOW // 기본 심각도 설정
        )
    }

    private isCriticalError(error: WebSocketError): boolean {
        return (
            error.severity === ErrorSeverity.CRITICAL ||
            error.code === ErrorCode.CONNECTION_FAILED
        )
    }
}
