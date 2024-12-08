import { createMachine, assign } from "xstate";
import { WebSocketConfig } from "./types";
import { IWebSocketClient } from "./IWebSocketClient";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types";
import { ExtendedWebSocketManagerMetrics } from "../types/metrics";
import { ConnectorState } from "../states/types";

interface WebSocketContext {
    retryCount: number;
    error?: WebSocketError;
    lastError?: WebSocketError;
    metrics: ExtendedWebSocketManagerMetrics;
    config: WebSocketConfig;
    client: IWebSocketClient;
    timers: {
        ping?: NodeJS.Timeout;
        pong?: NodeJS.Timeout;
    };
}

type WebSocketEvent =
    | { type: "CONNECT" }
    | { type: "CONNECTION_ESTABLISHED" }
    | {
          type: "ERROR";
          error: WebSocketError;
          metadata?: {
              isCritical?: boolean;
              needsManualRecovery?: boolean;
              isRecoverable?: boolean;
              suggestedAction?: string;
          };
      }
    | { type: "DISCONNECT" }
    | { type: "DISCONNECTED" }
    | { type: "SEND_PING" }
    | { type: "PONG_RECEIVED" };

// 공통 함수: 타이머 제거
const clearTimers = (context: WebSocketContext): WebSocketContext["timers"] => {
    if (context.timers.ping) clearInterval(context.timers.ping);
    if (context.timers.pong) clearTimeout(context.timers.pong);
    return { ping: undefined, pong: undefined }; // 명확히 반환
};

// 공통 함수: 메트릭 업데이트
const updateMetrics = (
    context: WebSocketContext,
    updates: Partial<ExtendedWebSocketManagerMetrics>
): ExtendedWebSocketManagerMetrics => ({
    ...context.metrics,
    ...updates,
});

// 공통 함수: 상태 전환 시 메트릭 업데이트
const updateStateMetrics = (
    context: WebSocketContext,
    newState: ConnectorState
): ExtendedWebSocketManagerMetrics => {
    return updateMetrics(context, {
        currentState: {
            state: newState,
            since: Date.now(),
        },
    });
};

// 에러 메트릭 업데이트
const updateErrorMetrics = (
    context: WebSocketContext,
    error: WebSocketError
): ExtendedWebSocketManagerMetrics => {
    return updateMetrics(context, {
        errors: {
            ...context.metrics.errors,
            count: context.metrics.errors.count + 1,
            lastUpdated: Date.now(),
            lastError: {
                code: error.code,
                message: error.message,
                severity: error.severity,
                timestamp: Date.now(),
            },
        },
    });
};

// 공통 함수: 타이머 설정
const setupTimersForState = (
    context: WebSocketContext,
    state: ConnectorState
): WebSocketContext["timers"] => {
    if (
        state === ConnectorState.CONNECTED &&
        context.config.options?.pingInterval
    ) {
        const ping = setInterval(() => {
            context.client.send({ type: "ping" });
        }, context.config.options.pingInterval);
        context.timers.ping = ping;
    }
    return context.timers;
};

const createWebSocketMachine = (
    client: IWebSocketClient,
    config: WebSocketConfig,
    initialMetrics: ExtendedWebSocketManagerMetrics
) => {
    return createMachine<WebSocketContext, WebSocketEvent>({
        id: "websocket",
        initial: ConnectorState.INITIAL,

        context: {
            retryCount: 0,
            error: undefined,
            lastError: undefined,
            metrics: initialMetrics,
            config,
            client,
            timers: {},
        },

        states: {
            [ConnectorState.INITIAL]: {
                on: {
                    CONNECT: {
                        target: ConnectorState.CONNECTING,
                        actions: assign({ retryCount: 0 }),
                    },
                },
            },

            [ConnectorState.CONNECTING]: {
                entry: [
                    (context) => {
                        context.client.connect(
                            context.config.url,
                            context.config.options
                        );
                    },
                    assign({
                        metrics: (context) =>
                            updateStateMetrics(
                                context,
                                ConnectorState.CONNECTING
                            ),
                    }),
                ],
                on: {
                    CONNECTION_ESTABLISHED: {
                        target: ConnectorState.CONNECTED,
                        actions: assign({
                            metrics: (context) =>
                                updateMetrics(context, {
                                    successfulConnections: {
                                        count:
                                            context.metrics
                                                .successfulConnections.count +
                                            1,
                                        lastUpdated: Date.now(),
                                    },
                                }),
                        }),
                    },
                    ERROR: {
                        target: ConnectorState.ERROR,
                        actions: assign({
                            error: (_, event) => event.error,
                            lastError: (_, event) => event.error,
                            metrics: (context, event) =>
                                updateErrorMetrics(context, event.error),
                        }),
                    },
                },
            },

            [ConnectorState.CONNECTED]: {
                entry: [
                    (context) => {
                        setupTimersForState(context, ConnectorState.CONNECTED);
                    },
                    assign({
                        metrics: (context) =>
                            updateStateMetrics(
                                context,
                                ConnectorState.CONNECTED
                            ),
                    }),
                ],
                exit: assign({
                    timers: (context) => clearTimers(context),
                }),
                on: {
                    ERROR: {
                        target: ConnectorState.ERROR,
                        actions: assign({
                            error: (_, event) => event.error,
                            lastError: (_, event) => event.error,
                        }),
                    },
                    DISCONNECT: ConnectorState.DISCONNECTING,
                },
            },

            [ConnectorState.ERROR]: {
                entry: [
                    assign({
                        timers: (context) => clearTimers(context),
                        retryCount: () => 0, // 재시도 횟수 초기화
                        metrics: (context) =>
                            updateStateMetrics(context, ConnectorState.ERROR),
                    }),
                ],
                on: {
                    CONNECT: {
                        target: ConnectorState.CONNECTING,
                        cond: (context) => {
                            const maxAttempts =
                                context.config.reconnectOptions?.maxAttempts ||
                                0;
                            return context.retryCount < maxAttempts;
                        },
                        actions: assign({
                            retryCount: (context) => context.retryCount + 1,
                        }),
                    },
                    DISCONNECTED: ConnectorState.DISCONNECTED,
                },
            },

            [ConnectorState.DISCONNECTING]: {
                entry: [
                    assign({
                        timers: (context) => clearTimers(context),
                        metrics: (context) =>
                            updateStateMetrics(
                                context,
                                ConnectorState.DISCONNECTING
                            ),
                    }),
                ],
                on: {
                    DISCONNECTED: ConnectorState.DISCONNECTED,
                    ERROR: {
                        target: ConnectorState.ERROR,
                        actions: assign({
                            error: (_, event) => event.error,
                            lastError: (_, event) => event.error,
                        }),
                    },
                },
            },

            [ConnectorState.DISCONNECTED]: {
                entry: assign({
                    metrics: (context) =>
                        updateStateMetrics(
                            context,
                            ConnectorState.DISCONNECTED
                        ),
                }),
                on: {
                    CONNECT: {
                        target: ConnectorState.CONNECTING,
                        actions: assign({
                            retryCount: 0,
                            error: undefined,
                            lastError: undefined,
                        }),
                    },
                },
            },
        },
    });
};

export { createWebSocketMachine, type WebSocketContext, type WebSocketEvent };
