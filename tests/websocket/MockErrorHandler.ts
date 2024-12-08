/**
 * Path: /tests/mock/MockErrorHandler.ts
 * 테스트를 위한 에러 핸들러 구현
 */

import { IErrorHandler } from "../../src/errors/ErrorHandler";
import {
    WebSocketError,
    ErrorCode,
    ErrorSeverity,
} from "../../src/errors/types";

export class MockErrorHandler implements IErrorHandler {
    private errorCount = 0;
    private fatalErrorCount = 0;
    private lastError?: WebSocketError;
    private readonly errors: WebSocketError[] = [];

    async handleFatalError(error: Error): Promise<void> {
        this.fatalErrorCount++;
        const wsError = new WebSocketError(
            ErrorCode.INTERNAL_ERROR,
            error.message || "Fatal error occurred",
            error,
            ErrorSeverity.CRITICAL
        );
        this.lastError = wsError;
        this.errors.push(wsError);
    }

    handleError(error: unknown): WebSocketError {
        this.errorCount++;
        const wsError = this.convertToWebSocketError(error);
        this.lastError = wsError;
        this.errors.push(wsError);
        return wsError;
    }

    handleConnectorError(connectorId: string, error: WebSocketError): void {
        this.errorCount++;
        this.lastError = error;
        this.errors.push(error);
    }

    handleWebSocketError(error: unknown): WebSocketError {
        this.errorCount++;
        const wsError = this.convertToWebSocketError(error);
        this.lastError = wsError;
        this.errors.push(wsError);
        return wsError;
    }

    private convertToWebSocketError(error: unknown): WebSocketError {
        if (error instanceof WebSocketError) {
            return error;
        }

        if (error instanceof Error) {
            return new WebSocketError(
                ErrorCode.INTERNAL_ERROR,
                error.message,
                error,
                ErrorSeverity.MEDIUM
            );
        }

        return new WebSocketError(
            ErrorCode.INTERNAL_ERROR,
            "Unknown error occurred",
            undefined,
            ErrorSeverity.LOW
        );
    }

    // 테스트 도우미 메서드들
    getErrorCount(): number {
        return this.errorCount;
    }

    getFatalErrorCount(): number {
        return this.fatalErrorCount;
    }

    getLastError(): WebSocketError | undefined {
        return this.lastError;
    }

    getErrors(): WebSocketError[] {
        return [...this.errors];
    }

    clearErrors(): void {
        this.errorCount = 0;
        this.fatalErrorCount = 0;
        this.lastError = undefined;
        this.errors.length = 0;
    }
}
