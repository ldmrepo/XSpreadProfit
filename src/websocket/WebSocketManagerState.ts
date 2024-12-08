/**
 * Path: src/websocket/WebSocketManager.ts
 * XState 기반 WebSocket 연결 관리자
 */

import { EventEmitter } from "events";
import { interpret, StateMachine, InterpreterFrom } from "xstate";
import { IWebSocketClient } from "./IWebSocketClient";
import { WebSocketConfig } from "./types";
import { IErrorHandler } from "../errors/ErrorHandler";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types";
import { ExtendedWebSocketManagerMetrics } from "../types/metrics";
import {
    createWebSocketMachine,
    WebSocketContext,
    WebSocketEvent,
} from "./WebSocketStateMachine";
import { ConnectorState, StateTransitionEvent } from "../states/types";

export class WebSocketManager extends EventEmitter {
    private stateMachine: StateMachine<WebSocketContext, any, WebSocketEvent>;
    private service: InterpreterFrom<
        StateMachine<WebSocketContext, any, WebSocketEvent>
    >;

    private reconnectAttempts = 0;
    private pingTimer?: NodeJS.Timer;
    private pongTimer?: NodeJS.Timer;

    constructor(
        private readonly client: IWebSocketClient,
        private readonly config: WebSocketConfig,
        private readonly errorHandler: IErrorHandler,
        private readonly id: string = `ws_${Date.now()}`
    ) {
        super();
        this.stateMachine = createWebSocketMachine(
            this.client,
            this.config,
            this.createInitialMetrics()
        );
        this.service = interpret(this.stateMachine)
            .onTransition((state) => {
                if (state.changed) {
                    this.emitStateChange(state);
                }
            })
            .start();
        this.setupClientEventHandlers();
    }

    private createInitialMetrics(): ExtendedWebSocketManagerMetrics {
        const now = Date.now();
        return {
            totalConnections: { count: 0, lastUpdated: now },
            successfulConnections: { count: 0, lastUpdated: now },
            failedConnections: { count: 0, lastUpdated: now },
            activeConnections: { count: 0, lastUpdated: now },
            totalMessages: { count: 0, lastUpdated: now },
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
                lastError: undefined,
            },
            currentState: {
                state: ConnectorState.INITIAL,
                since: now,
            },
            reconnects: {
                attempts: { count: 0, lastUpdated: now },
                successes: { count: 0, lastUpdated: now },
                failures: { count: 0, lastUpdated: now },
                lastAttempt: undefined,
            },
        };
    }

    private emitStateChange(state: any) {
        this.emit("stateChange", {
            id: this.id,
            previousState: state.history?.value,
            currentState: state.value,
            timestamp: Date.now(),
            metadata: {
                context: state.context,
                error: state.context.error,
                metrics: {
                    reconnectAttempts: this.reconnectAttempts,
                    errors: state.context.metrics.errors.count,
                },
            },
        });
    }

    private emitMetricsUpdate(metrics: ExtendedWebSocketManagerMetrics) {
        this.emit("metricsUpdate", metrics);
    }

    private setupClientEventHandlers() {
        this.client.on("open", () =>
            this.service.send("CONNECTION_ESTABLISHED")
        );
        this.client.on("message", (data) => this.handleMessage(data));
        this.client.on("close", () => this.handleClose());
        this.client.on("error", (error) => this.handleError(error));
    }

    private handleMessage(data: unknown) {
        try {
            const message = typeof data === "string" ? JSON.parse(data) : data;
            if (message.type === "pong") {
                this.service.send("PONG_RECEIVED");
                return;
            }

            this.updateMetrics("message");
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

    private handleClose() {
        this.service.send("DISCONNECTED");

        if (this.config.reconnectOptions?.maxAttempts) {
            this.handleReconnect().catch((error) => this.handleError(error));
        }
    }

    private handleError(error: unknown) {
        const wsError = this.errorHandler.handleWebSocketError(error);

        switch (wsError.severity) {
            case ErrorSeverity.CRITICAL:
                this.service.send({
                    type: "ERROR",
                    error: wsError,
                    metadata: {
                        isCritical: true,
                        needsManualRecovery: true,
                    },
                });
                break;
            case ErrorSeverity.HIGH:
                this.service.send({
                    type: "ERROR",
                    error: wsError,
                    metadata: { isRecoverable: true },
                });
                break;
            default:
                this.emit("warning", {
                    error: wsError,
                    currentState: this.getState(),
                });
                break;
        }
    }

    private async handleReconnect() {
        const { reconnectOptions } = this.config;
        if (
            !reconnectOptions ||
            this.reconnectAttempts >= reconnectOptions.maxAttempts
        ) {
            this.emit("reconnectFailed", {
                attempts: this.reconnectAttempts,
                maxAttempts: reconnectOptions?.maxAttempts,
            });
            return;
        }

        const startTime = Date.now();
        this.reconnectAttempts++;

        const delay = Math.min(
            reconnectOptions.delay * Math.pow(2, this.reconnectAttempts - 1),
            reconnectOptions.maxDelay ?? Infinity
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
            await this.connect();
            this.updateReconnectMetrics(
                startTime,
                Date.now() - startTime,
                true
            );
        } catch (error) {
            this.updateReconnectMetrics(
                startTime,
                Date.now() - startTime,
                false
            );
            throw error;
        }
    }

    private updateReconnectMetrics(
        startTime: number,
        duration: number,
        success: boolean
    ) {
        const context = this.service.getSnapshot().context;
        const metrics = context.metrics.reconnects;

        metrics.attempts.count++;
        metrics.attempts.lastUpdated = Date.now();

        if (success) {
            metrics.successes.count++;
            metrics.successes.lastUpdated = Date.now();
        } else {
            metrics.failures.count++;
            metrics.failures.lastUpdated = Date.now();
        }

        metrics.lastAttempt = {
            timestamp: startTime,
            success,
            duration,
        };

        this.emit("metricsUpdate", this.getMetrics());
    }

    private updateMetrics(
        type: "connection" | "message" | "error" | "reconnect",
        success?: boolean,
        duration?: number,
        data?: WebSocketError
    ) {
        const now = Date.now();
        const metrics = this.service.getSnapshot().context.metrics;

        switch (type) {
            case "connection":
                metrics.totalConnections.count++;
                metrics.totalConnections.lastUpdated = now;
                if (success) {
                    metrics.successfulConnections.count++;
                    metrics.activeConnections.count++;
                } else {
                    metrics.failedConnections.count++;
                }
                break;

            case "message":
                metrics.totalMessages.count++;
                metrics.totalMessages.lastUpdated = now;
                break;

            case "error":
                metrics.errors.count++;
                metrics.errors.lastUpdated = now;
                if (data) {
                    metrics.errors.byCode[data.code]++;
                    metrics.errors.bySeverity[data.severity]++;
                    metrics.errors.lastError = {
                        code: data.code,
                        message: data.message,
                        severity: data.severity,
                        timestamp: now,
                    };
                }
                break;

            case "reconnect":
                metrics.reconnects.attempts.count++;
                metrics.reconnects.attempts.lastUpdated = now;
                if (success) {
                    metrics.reconnects.successes.count++;
                    metrics.reconnects.successes.lastUpdated = now;
                } else {
                    metrics.reconnects.failures.count++;
                    metrics.reconnects.failures.lastUpdated = now;
                }
                if (duration) {
                    metrics.reconnects.lastAttempt = {
                        timestamp: now - duration,
                        success: success || false,
                        duration,
                    };
                }
                break;
        }

        this.emitMetricsUpdate(metrics);
    }

    public async connect(): Promise<void> {
        if (this.getState() === ConnectorState.CONNECTED) {
            return;
        }
        this.service.send("CONNECT");
    }

    public async disconnect(): Promise<void> {
        if (this.getState() === ConnectorState.DISCONNECTED) {
            return;
        }
        this.service.send("DISCONNECT");
    }

    public send(data: unknown): void {
        if (this.getState() !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Cannot send message: WebSocket is not connected"
            );
        }

        try {
            this.client.send(data);
            this.updateMetrics("message");
        } catch (error) {
            this.handleError(error);
        }
    }

    public getState(): ConnectorState {
        return this.service.getSnapshot().value as ConnectorState;
    }

    public getMetrics(): ExtendedWebSocketManagerMetrics {
        return this.service.getSnapshot().context.metrics;
    }

    public resetMetrics(): void {
        const currentState = this.getState();
        const now = Date.now();

        const initialMetrics: ExtendedWebSocketManagerMetrics = {
            totalConnections: { count: 0, lastUpdated: now },
            successfulConnections: { count: 0, lastUpdated: now },
            failedConnections: { count: 0, lastUpdated: now },
            activeConnections: { count: 0, lastUpdated: now },
            totalMessages: { count: 0, lastUpdated: now },
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
                lastError: undefined,
            },
            currentState: {
                state: currentState,
                since: now,
            },
            reconnects: {
                attempts: { count: 0, lastUpdated: now },
                successes: { count: 0, lastUpdated: now },
                failures: { count: 0, lastUpdated: now },
                lastAttempt: undefined,
            },
        };

        const context = this.service.getSnapshot().context;
        context.metrics = initialMetrics;
        this.emit("metricsReset", { timestamp: now });
    }
}
