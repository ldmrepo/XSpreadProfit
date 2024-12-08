/**
 * Path: tests/errors/ErrorHandler.test.ts
 * ErrorHandler 클래스의 테스트
 */

import { ErrorHandler } from "../../src/errors/ErrorHandler";
import {
    WebSocketError,
    ErrorCode,
    ErrorSeverity,
} from "../../src/errors/types";

describe("ErrorHandler", () => {
    let errorHandler: ErrorHandler;
    let onFatalErrorMock: jest.Mock;
    let onErrorMock: jest.Mock;

    beforeEach(() => {
        onFatalErrorMock = jest.fn(() => Promise.resolve()); // Promise 반환
        onErrorMock = jest.fn();
        errorHandler = new ErrorHandler(onFatalErrorMock, onErrorMock);
    });

    test("handleError processes and returns a WebSocketError", () => {
        const genericError = new Error("A generic error occurred");

        const result = errorHandler.handleError(genericError);

        expect(result).toBeInstanceOf(WebSocketError);
        expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(result.message).toBe("A generic error occurred");
        expect(result.originalError).toBe(genericError);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(onErrorMock).toHaveBeenCalledWith(result);
    });

    test("handleError passes through WebSocketError", () => {
        const wsError = new WebSocketError(
            ErrorCode.CONNECTION_FAILED,
            "Connection failed",
            undefined,
            ErrorSeverity.HIGH
        );

        const result = errorHandler.handleError(wsError);

        expect(result).toBe(wsError);
        expect(onErrorMock).toHaveBeenCalledWith(wsError);
    });

    test("handleFatalError processes and triggers fatal callback", async () => {
        const criticalError = new Error("Critical system failure");

        errorHandler.handleFatalError(criticalError);

        expect(onFatalErrorMock).toHaveBeenCalled(); // onFatalError가 호출되었는지 확인
        expect(onErrorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Fatal error occurred",
                originalError: criticalError,
                severity: ErrorSeverity.CRITICAL,
            })
        );
    });

    test("handleConnectorError processes critical errors as fatal", () => {
        const criticalWsError = new WebSocketError(
            ErrorCode.CONNECTION_FAILED,
            "Critical connection error",
            undefined,
            ErrorSeverity.CRITICAL
        );

        errorHandler.handleConnectorError("connector-1", criticalWsError);

        expect(onFatalErrorMock).toHaveBeenCalled(); // 치명적 에러의 경우 fatal 처리 확인
        expect(onErrorMock).toHaveBeenCalledWith(criticalWsError);
    });

    test("handleConnectorError processes non-critical errors as normal", () => {
        const nonCriticalWsError = new WebSocketError(
            ErrorCode.MESSAGE_PARSE_ERROR,
            "Message parsing failed",
            undefined,
            ErrorSeverity.LOW
        );

        errorHandler.handleConnectorError("connector-2", nonCriticalWsError);

        expect(onFatalErrorMock).not.toHaveBeenCalled();
        expect(onErrorMock).toHaveBeenCalledWith(nonCriticalWsError);
    });

    test("handleWebSocketError normalizes generic errors", () => {
        const genericError = new Error("A WebSocket-related error");

        const result = errorHandler.handleWebSocketError(genericError);

        expect(result).toBeInstanceOf(WebSocketError);
        expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(result.message).toBe("A WebSocket-related error");
        expect(result.originalError).toBe(genericError);
    });

    test("handleWebSocketError normalizes unknown errors", () => {
        const unknownError = "An unexpected string error";

        const result = errorHandler.handleWebSocketError(unknownError);

        expect(result).toBeInstanceOf(WebSocketError);
        expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(result.message).toBe("Unknown error occurred");
        expect(result.originalError).toBeUndefined();
        expect(result.severity).toBe(ErrorSeverity.LOW);
    });
});
