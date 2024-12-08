/**
 * Path: src/websocket/types.ts
 * 웹소켓 설정 및 이벤트 타입 정의
 */

export interface WebSocketConfig {
    url: string;
    options?: {
        headers?: Record<string, string>;
        timeout?: number;
        connectionTimeout?: number; // 연결 타임아웃 (ms)
        pingInterval?: number; // ping 간격 (ms)
        pongTimeout?: number; // pong 응답 대기 시간 (ms)
    };
    reconnectOptions?: {
        maxAttempts: number;
        delay: number; // 재연결 시도 간격 (ms)
        maxDelay?: number; // 최대 재연결 간격 (ms)
    };
}

export interface WebSocketMessage<T = unknown> {
    type: string;
    symbol: string;
    data: T;
}

export interface WebSocketEvent {
    type: "open" | "close" | "error" | "message";
    timestamp: number;
    data?: unknown;
    error?: Error;
}

export interface WebSocketSubscription {
    type: "subscribe" | "unsubscribe";
    symbol: string;
}
