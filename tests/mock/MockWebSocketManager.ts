/**
 * Path: /tests/mock/MockWebSocketManager.ts
 */
import { EventEmitter } from "events";
import { IWebSocketManager } from "../../src/websocket/IWebSocketManager";
import { WebSocketConfig } from "../../src/websocket/types";
import { ConnectorState } from "../../src/states/types";
import { ExtendedWebSocketManagerMetrics } from "../../src/types/metrics";
import { IWebSocketClient } from "../../src/websocket/IWebSocketClient";
import { IErrorHandler } from "../../src/errors/ErrorHandler";
import {
    ErrorCode,
    ErrorSeverity,
    WebSocketError,
} from "../../src/errors/types";

export class MockWebSocketClient
    extends EventEmitter
    implements IWebSocketClient
{
    private isOpen = false;

    connect(url: string, options?: any): Promise<void> {
        return new Promise((resolve) => {
            this.isOpen = true;
            this.emit("open");
            resolve();
        });
    }

    send(data: unknown): void {
        if (!this.isOpen) {
            throw new Error("WebSocket is not open.");
        }
        this.emit("message", data);
    }

    close(): void {
        if (this.isOpen) {
            this.isOpen = false;
            this.emit("close");
        }
    }

    on(event: string, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    // 테스트를 위한 추가 메서드
    simulateMessage(data: unknown): void {
        console.log("Simulating message:", data);
        this.emit("message", data); // manager에서 직접 메시지 발생
    }

    simulateError(error: Error): void {
        this.emit("error", error);
    }
}

export class MockWebSocketManager
    extends EventEmitter
    implements IWebSocketManager
{
    public readonly client: MockWebSocketClient;
    public readonly config: WebSocketConfig;
    public readonly errorHandler: IErrorHandler;
    public readonly id: string;
    private state: ConnectorState = ConnectorState.INITIAL;
    private metrics: ExtendedWebSocketManagerMetrics;

    constructor(
        id: string,
        config: WebSocketConfig,
        errorHandler: IErrorHandler
    ) {
        super();
        this.id = id;
        this.config = config;
        this.errorHandler = errorHandler;
        this.client = new MockWebSocketClient();
        this.metrics = this.createInitialMetrics();

        // client의 메시지를 manager로 전달
        this.client.on("message", (data) => {
            this.emit("message", data); // manager에서 메시지 재전파
        });
    }
    simulateMessage(data: unknown): void {
        // console.log("Simulating message:", data);
        this.client.emit("message", data);
    }
    simulateConnectionClose(): void {
        this.client.emit("close");
    }
    simulateError(error: Error): void {
        this.client.emit("error", error);
    }

    private createInitialMetrics(): ExtendedWebSocketManagerMetrics {
        const now = Date.now();
        const createTimeSeriesMetric = () => ({
            count: 0,
            lastUpdated: now,
        });

        return {
            totalConnections: createTimeSeriesMetric(),
            successfulConnections: createTimeSeriesMetric(),
            failedConnections: createTimeSeriesMetric(),
            activeConnections: createTimeSeriesMetric(),
            totalMessages: createTimeSeriesMetric(),
            errors: {
                count: 0,
                lastUpdated: now,
                byCode: Object.values(ErrorCode).reduce(
                    (acc, code) => ({ ...acc, [code]: 0 }),
                    {} as Record<ErrorCode, number>
                ),
                bySeverity: Object.values(ErrorSeverity).reduce(
                    (acc, severity) => ({ ...acc, [severity]: 0 }),
                    {} as Record<ErrorSeverity, number>
                ),
            },
            currentState: {
                state: ConnectorState.INITIAL,
                since: now,
            },
            reconnects: {
                attempts: createTimeSeriesMetric(),
                successes: createTimeSeriesMetric(),
                failures: createTimeSeriesMetric(),
                lastAttempt: undefined,
            },
        };
    }

    async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state === ConnectorState.CONNECTED) {
                resolve(); // 이미 연결된 상태라면 Promise를 해결
                return;
            }

            try {
                this.updateState(ConnectorState.CONNECTING);

                // WebSocket 연결 시도
                this.client.connect(this.config.url, this.config.options);

                // 연결 성공 처리
                this.updateState(ConnectorState.CONNECTED);
                this.emit("connected");
                resolve(); // 연결 성공 시 Promise를 해결
            } catch (error) {
                console.error("WebSocket connection failed:", error);
                // this.handleError(error); // 에러 처리
                reject(error); // 에러 발생 시 Promise를 거부
            }
        });
    }

    async disconnect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state === ConnectorState.DISCONNECTED) {
                resolve(); // 이미 DISCONNECTED 상태라면 Promise를 해결
                return;
            }

            try {
                console.log(
                    "MockWebSocketManager Disconnecting WebSocket...DISCONNECTING"
                );
                this.updateState(ConnectorState.DISCONNECTING);

                // WebSocket 연결 해제
                this.client.close();

                // 연결 해제 성공 처리
                this.updateState(ConnectorState.DISCONNECTED);

                console.log("MockWebSocketManager WebSocket disconnected");

                // this.emit("disconnected");
                resolve(); // 연결 해제 성공 시 Promise를 해결
            } catch (error) {
                console.error(
                    "MockWebSocketManager WebSocket disconnection failed:",
                    error
                );
                // this.handleError(error); // 에러 처리
                reject(error); // 에러 발생 시 Promise를 거부
            }
        });
    }

    send(data: unknown): void {
        if (this.state !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Cannot send message: WebSocket is not connected"
            );
        }

        this.metrics.totalMessages.count++;
        this.metrics.totalMessages.lastUpdated = Date.now();
        this.client.send(data);
    }

    getState(): ConnectorState {
        return this.state;
    }

    getMetrics(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics));
    }

    getMetricsSnapshot(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics));
    }

    resetMetrics(): void {
        this.metrics = this.createInitialMetrics();
        this.emit("metricsReset", { timestamp: Date.now() });
    }

    private updateState(newState: ConnectorState): void {
        const previousState = this.state;
        this.state = newState;

        this.emit("stateChange", {
            id: this.id,
            previousState,
            currentState: newState,
            timestamp: Date.now(),
        });
    }
}
