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
        const wsError = new WebSocketError(
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
            return error
        }
        return new WebSocketError(
            ErrorCode.INTERNAL_ERROR,
            error instanceof Error ? error.message : "Unknown error occurred",
            error instanceof Error ? error : undefined
        )
    }

    private isCriticalError(error: WebSocketError): boolean {
        return (
            error.severity === ErrorSeverity.CRITICAL ||
            error.code === ErrorCode.CONNECTION_FAILED
        )
    }
}
