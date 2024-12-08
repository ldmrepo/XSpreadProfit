/**
 * Path: src/websocket/WebSocketManager.ts
 * WebSocket 연결 관리 및 메시지 송수신 담당
 */

import { EventEmitter } from "events";
import { IWebSocketClient } from "./IWebSocketClient";
import { WebSocketConfig } from "./types";
import {
    ConnectorState,
    StateTransitionEvent,
    validStateTransitions,
} from "../states/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types";
import { IErrorHandler } from "../errors/ErrorHandler";
import {
    ExtendedWebSocketManagerMetrics,
    TimeSeriesMetric,
} from "../types/metrics";
import e from "express";

export class WebSocketManager extends EventEmitter {
    private boundHandlers: Map<string, (...args: any[]) => void>;
    private state: ConnectorState = ConnectorState.INITIAL;
    private reconnectAttempts = 0;
    private pingTimer?: NodeJS.Timer;
    private pongTimer?: NodeJS.Timer;
    private metrics: ExtendedWebSocketManagerMetrics =
        this.createInitialMetrics();

    constructor(
        public readonly client: IWebSocketClient,
        public readonly config: WebSocketConfig,
        public readonly errorHandler: IErrorHandler,
        public readonly id: string = `ws_${Date.now()}`
    ) {
        super();
        this.boundHandlers = new Map();
        this.setupClientEventHandlers();
    }

    // 소멸자 메서드 추가
    public destroy(): void {
        this.cleanup();
        this.removeAllListeners(); // EventEmitter의 모든 리스너 제거
    }
    private setupClientEventHandlers(): void {
        // 핸들러 바인딩 및 저장
        const handlers = {
            open: this.handleOpen.bind(this),
            message: this.handleMessage.bind(this),
            close: this.handleClose.bind(this),
            error: this.handleError.bind(this),
        };

        // 핸들러 등록 및 저장
        Object.entries(handlers).forEach(([event, handler]) => {
            this.boundHandlers.set(event, handler);
            this.client.on(event, handler);
        });
    }

    public cleanup(): void {
        // 등록된 모든 핸들러 제거
        this.boundHandlers.forEach((handler, event) => {
            this.client.removeListener(event, handler);
        });
        this.boundHandlers.clear();
        this.removeAllListeners();
    }

    private createInitialMetrics(): ExtendedWebSocketManagerMetrics {
        const now = Date.now();
        const createTimeSeriesMetric = (): TimeSeriesMetric => ({
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
            },
        };
    }

    private isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean {
        return validStateTransitions[from]?.includes(to) ?? false;
    }

    private updateState(
        newState: ConnectorState,
        metadata?: Record<string, unknown>
    ): void {
        console.log("State Change:", this.state, "->", newState);
        if (this.state === newState) return;

        if (!this.isValidStateTransition(this.state, newState)) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid state transition from ${this.state} to ${newState}`
            );
        }
        const now = Date.now();
        const previousState = this.state;

        if (
            newState === ConnectorState.ERROR ||
            newState === ConnectorState.DISCONNECTED
        ) {
            this.clearTimers();
        }
        this.state = newState;
        this.metrics.currentState.state = newState;
        this.metrics.currentState.since = now;
        const event: StateTransitionEvent = {
            id: this.id,
            previousState,
            currentState: newState,
            timestamp: now,
            metadata: {
                ...metadata,
                metrics: {
                    reconnectAttempts: this.reconnectAttempts,
                    errors: this.metrics.errors.count,
                    reconnects: this.metrics.reconnects.attempts.count,
                },
            },
        };
        this.emit("stateChange", event);
        this.updateMetricsForState(newState, now);
    }

    private updateMetricsForState(
        state: ConnectorState,
        timestamp: number
    ): void {
        const updateMetric = (
            metric: keyof ExtendedWebSocketManagerMetrics,
            increment: number
        ) => {
            if (
                typeof this.metrics[metric] === "object" &&
                "count" in this.metrics[metric]
            ) {
                (this.metrics[metric] as TimeSeriesMetric).count += increment;
                (this.metrics[metric] as TimeSeriesMetric).lastUpdated =
                    timestamp;
            }
        };

        switch (state) {
            case ConnectorState.CONNECTING:
                updateMetric("totalConnections", 1);
                break;
            case ConnectorState.CONNECTED:
                updateMetric("successfulConnections", 1);
                updateMetric("activeConnections", 1);
                break;
            case ConnectorState.ERROR:
                updateMetric("failedConnections", 1);
                break;
            case ConnectorState.DISCONNECTED:
                updateMetric("activeConnections", -1);
                break;
        }

        this.emit("metricsUpdate", this.getMetricsSnapshot());
    }

    private setupPing(): void {
        if (this.config.options?.pingInterval) {
            this.pingTimer = setInterval(() => {
                try {
                    this.client.send({ type: "ping" });
                    this.setupPongTimeout();
                } catch (error) {
                    this.handleError(error);
                }
            }, this.config.options.pingInterval);
        }
    }

    private setupPongTimeout(): void {
        if (this.config.options?.pongTimeout) {
            this.pongTimer = setTimeout(() => {
                this.handleError(
                    new WebSocketError(
                        ErrorCode.CONNECTION_TIMEOUT,
                        "Pong response timeout",
                        undefined,
                        ErrorSeverity.HIGH
                    )
                );
            }, this.config.options.pongTimeout);
        }
    }

    private clearTimers(): void {
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.pongTimer) clearTimeout(this.pongTimer);
    }

    private async handleReconnect(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            const { reconnectOptions } = this.config;
            if (
                !reconnectOptions ||
                this.reconnectAttempts >= reconnectOptions.maxAttempts
            ) {
                this.metrics.reconnects.failures.count++;
                this.metrics.reconnects.failures.lastUpdated = Date.now();
                this.emit("reconnectFailed", {
                    attempts: this.reconnectAttempts,
                    maxAttempts: reconnectOptions?.maxAttempts,
                });

                resolve(); // 최대 재연결 시도 횟수에 도달하면 작업 완료 처리
                return;
            }

            const startTime = Date.now();
            this.reconnectAttempts++;
            this.metrics.reconnects.attempts.count++;
            this.metrics.reconnects.attempts.lastUpdated = startTime;

            const delay = Math.min(
                reconnectOptions.delay *
                    Math.pow(2, this.reconnectAttempts - 1),
                reconnectOptions.maxDelay ?? Infinity
            );

            await new Promise((resolve) => setTimeout(resolve, delay));

            try {
                await this.connect();
                const duration = Date.now() - startTime;
                this.updateReconnectSuccessMetrics(startTime, duration);
                resolve(); // 재연결 성공 시 resolve 호출
            } catch (error) {
                const duration = Date.now() - startTime;
                this.updateReconnectFailureMetrics(startTime, duration);
                reject(error); // 재연결 실패 시 reject 호출
            }
        });
    }

    private updateReconnectSuccessMetrics(
        startTime: number,
        duration: number
    ): void {
        this.metrics.reconnects.successes.count++;
        this.metrics.reconnects.successes.lastUpdated = Date.now();
        this.metrics.reconnects.lastAttempt = {
            timestamp: startTime,
            success: true,
            duration,
        };
    }

    private updateReconnectFailureMetrics(
        startTime: number,
        duration: number
    ): void {
        this.metrics.reconnects.failures.count++;
        this.metrics.reconnects.failures.lastUpdated = Date.now();
        this.metrics.reconnects.lastAttempt = {
            timestamp: startTime,
            success: false,
            duration,
        };
    }
    // public async connect(): Promise<void> {
    //     if (this.state === ConnectorState.CONNECTED) {
    //         return;
    //     }

    //     try {
    //         console.log("Connecting to WebSocket:", this.state);
    //         this.updateState(ConnectorState.CONNECTING);
    //         this.client.connect(this.config.url, this.config.options);
    //     } catch (error) {
    //         this.handleError(error);
    //     }
    // }
    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state === ConnectorState.CONNECTED) {
                resolve(); // 이미 연결된 상태라면 resolve 호출
                return;
            }

            try {
                console.log("Connecting to WebSocket:", this.state);
                this.updateState(ConnectorState.CONNECTING);
                this.client.connect(this.config.url, this.config.options);
            } catch (error) {
                this.handleError(error);
                reject(error); // 예외 발생 시 reject 호출
            }
        });
    }

    public async disconnect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // 타이머 정리
            this.clearTimers();
            console.log(
                "WebSocketManager Disconnecting WebSocket...****DISCONNECTING",
                this.state
            );
            this.updateState(ConnectorState.DISCONNECTING);

            try {
                this.client.close(); // WebSocket 종료 시도
            } catch (error) {
                this.handleError(error);
                reject(error); // 예외 발생 시 reject 호출
            }
        });
    }

    public send(data: unknown): void {
        if (this.state !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Cannot send message: WebSocket is not connected"
            );
        }

        try {
            this.client.send(data);
            this.metrics.totalMessages.count++;
            this.metrics.totalMessages.lastUpdated = Date.now();
        } catch (error) {
            this.handleError(error);
        }
    }

    private handleOpen(): void {
        this.reconnectAttempts = 0;
        this.updateState(ConnectorState.CONNECTED);
        this.setupPing();
        this.emit("connected");
    }

    private handleMessage(data: unknown): void {
        try {
            const message = typeof data === "string" ? JSON.parse(data) : data;
            if (message.type === "pong") {
                if (this.pongTimer) clearTimeout(this.pongTimer);
                return;
            }

            this.metrics.totalMessages.count++;
            this.metrics.totalMessages.lastUpdated = Date.now();
            this.emit("message", message);
        } catch (error) {
            this.handleError(
                new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    "Failed to parse message",
                    error as Error
                )
            );
        }
    }

    private handleClose(): void {
        this.clearTimers();
        this.updateState(ConnectorState.DISCONNECTED);
        this.emit("disconnected");

        if (this.config.reconnectOptions?.maxAttempts) {
            this.handleReconnect().catch((error) => this.handleError(error));
        }
    }

    private handleError(error: unknown): void {
        try {
            const wsError = this.errorHandler.handleWebSocketError(error);
            const now = Date.now();

            this.updateErrorMetrics(wsError, now);

            switch (wsError.severity) {
                case ErrorSeverity.CRITICAL:
                    this.handleCriticalError(wsError);
                    break;
                case ErrorSeverity.HIGH:
                    this.handleHighSeverityError(wsError);
                    break;
                default:
                    this.handleNormalError(wsError);
                    break;
            }

            this.emit("error", wsError);
        } catch (err) {
            console.error("Unhandled Error in handleError:", err); // 예외를 로깅
        }
    }

    private handleCriticalError(error: WebSocketError): void {
        this.updateState(ConnectorState.ERROR, {
            error,
            isCritical: true,
            needsManualRecovery: true,
        });
        this.clearTimers();
        this.client.close();
    }

    private handleHighSeverityError(error: WebSocketError): void {
        this.updateState(ConnectorState.ERROR, {
            error,
            isRecoverable: true,
        });
    }

    private handleNormalError(error: WebSocketError): void {
        // MEDIUM, LOW 심각도는 현재 상태 유지하면서 에러만 기록
        this.emit("warning", {
            error,
            currentState: this.state,
        });
    }

    private updateErrorMetrics(
        wsError: WebSocketError,
        timestamp: number
    ): void {
        this.metrics.errors.count++;
        this.metrics.errors.lastUpdated = timestamp;
        this.metrics.errors.byCode[wsError.code]++;
        this.metrics.errors.bySeverity[wsError.severity]++;
        this.metrics.errors.lastError = {
            code: wsError.code,
            message: wsError.message,
            severity: wsError.severity,
            timestamp,
        };
    }

    public getState(): ConnectorState {
        return this.state;
    }

    public getMetricsSnapshot(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics));
    }
    public getMetrics(): ExtendedWebSocketManagerMetrics {
        return JSON.parse(JSON.stringify(this.metrics));
    }
    public resetMetrics(): void {
        this.metrics = this.createInitialMetrics();
        this.emit("metricsReset", { timestamp: Date.now() });
    }

    // 디버깅을 위한 추가 메서드
    public simulateMessage(data: unknown): void {
        this.handleMessage(data);
    }
    public simulateConnectionClose(): void {
        this.handleClose();
    }
    public simulateError(error: Error): void {
        this.handleError(error);
    }
}
