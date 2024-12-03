/**
 * src/types/exchange.ts
 *
 * Exchange Types
 * - 거래소 관련 타입 정의
 * - WebSocket 설정, 거래소 정보, 레이트 리밋 등
 */

import { WebSocket } from "ws";

// WebSocket 관련 설정
export interface WebSocketConfig {
    url: string;
    options: {
        handshakeTimeout: number;
        pingInterval: number;
        pingTimeout: number;
        maxPayload?: number;
    };
}

// 거래소 레이트 리밋 설정
export interface RateLimit {
    maxConnections: number;
    messagePerSecond: number;
    restRequestPerSecond?: number;
}

// 거래소 정보
export interface ExchangeInfo {
    id: string;
    name: string;
    description: string;
    features: string[];
    rateLimit: RateLimit;
    timeouts?: {
        reconnect?: number;
        response?: number;
    };
}

// 거래소 연결 상태
export interface ExchangeStatus {
    connected: boolean;
    lastConnected?: number;
    reconnectAttempts: number;
    subscriptions: string[];
}
