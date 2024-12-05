/**
 * Path: src/websocket/types.ts
 * 웹소켓 설정 및 이벤트 타입 정의
 */

export interface WebSocketConfig {
    url: string;
    options?: {
        headers?: Record<string, string>;
        timeout?: number;
    };
    reconnectOptions?: {
        maxAttempts: number;
        delay: number;
        maxDelay?: number;
    };
}

export interface WebSocketMessage {
    type: string;
    data: unknown;
}

export interface WebSocketEvent {
    type: "open" | "close" | "error" | "message";
    timestamp: number;
    data?: unknown;
    error?: Error;
}
