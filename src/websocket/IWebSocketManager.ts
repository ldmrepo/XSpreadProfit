/**
 * Path: src/websocket/IWebSocketManager.ts
 */
import { EventEmitter } from "events";
import { WebSocketConfig } from "./types";
import { ConnectorState } from "../states/types";
import { ExtendedWebSocketManagerMetrics } from "../types/metrics";
import { IWebSocketClient } from "./IWebSocketClient";
import { IErrorHandler } from "../errors/ErrorHandler";

export interface IWebSocketManager extends EventEmitter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(data: unknown): void;
    getState(): ConnectorState;
    getMetrics(): ExtendedWebSocketManagerMetrics;
    getMetricsSnapshot(): ExtendedWebSocketManagerMetrics;
    resetMetrics(): void;

    // 필요한 경우 접근할 속성들
    readonly client: IWebSocketClient;
    readonly config: WebSocketConfig;
    readonly errorHandler: IErrorHandler;
    readonly id: string;
    // 디버깅을 위한 추가 메서드
    simulateMessage(data: unknown): void;
    simulateConnectionClose(): void;
    simulateError(error: Error): void;
}
