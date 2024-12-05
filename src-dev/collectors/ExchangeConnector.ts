/**
 * Path: src/collectors/ExchangeConnector.ts
 * 개별 웹소켓 연결 및 메시지 처리 담당
 */

import { EventEmitter } from "events";
import { WebSocketManager } from "../websocket/WebSocketManager";
import { WebSocketError, ErrorCode } from "../errors/types";
import {
    ConnectorState,
    StateChangeEvent,
    StateTransitionEvent,
} from "../states/types";
import { ConnectorMetrics, Metrics, SymbolGroup } from "./types";
import { WebSocketConfig, WebSocketMessage } from "../websocket/types";

interface ConnectorEvents {
    stateChange: (event: StateTransitionEvent) => void;
    error: (error: WebSocketError) => void;
    message: (data: WebSocketMessage) => void;
}

export class ExchangeConnector extends EventEmitter {
    private wsManager: WebSocketManager;
    private state: ConnectorState = ConnectorState.INITIAL;
    private metrics: ConnectorMetrics;
    private stateTimestamp: number;
    // EventEmitter 타입 지정
    emit<K extends keyof ConnectorEvents>(
        event: K,
        ...args: Parameters<ConnectorEvents[K]>
    ): boolean {
        return super.emit(event, ...args);
    }

    on<K extends keyof ConnectorEvents>(
        event: K,
        listener: ConnectorEvents[K]
    ): this {
        return super.on(event, listener);
    }
    constructor(
        private readonly id: string,
        private readonly symbols: SymbolGroup,
        config: WebSocketConfig
    ) {
        super();
        this.wsManager = new WebSocketManager(config);
        this.stateTimestamp = Date.now();
        this.metrics = this.initializeMetrics();
        this.setupEventHandlers();
    }

    private initializeMetrics(): Metrics {
        return {
            timestamp: Date.now(),
            status: this.state,
            messageCount: 0,
            errorCount: 0,
        };
    }

    private setupEventHandlers(): void {
        this.wsManager.on("message", this.handleMessage.bind(this));
        this.wsManager.on("error", this.handleError.bind(this));
    }

    async start(): Promise<void> {
        if (this.state !== ConnectorState.INITIAL) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "Connector can only be started from INITIAL state"
            );
        }

        try {
            await this.wsManager.connect();
            await this.subscribe();
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            await this.wsManager.disconnect();
            this.setState(ConnectorState.DISCONNECTED);
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    private async subscribe(): Promise<void> {
        this.setState(ConnectorState.SUBSCRIBING);

        try {
            this.symbols.forEach((symbol) => {
                this.wsManager.send({
                    type: "subscribe",
                    symbol,
                });
            });
            this.setState(ConnectorState.SUBSCRIBED);
        } catch (error) {
            throw new WebSocketError(
                ErrorCode.SUBSCRIPTION_FAILED,
                "Failed to subscribe to symbols",
                error as Error
            );
        }
    }

    protected updateState(newState: ConnectorState): void {
        const previousState = this.currentState;
        this.currentState = newState;
        this.stateTimestamp = Date.now();
        this.metrics.state = newState;

        this.emit("stateChange", {
            id: this.getId(),
            previousState,
            currentState: newState,
            timestamp: this.stateTimestamp,
        });
    }
    protected isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean {
        return validStateTransitions[from]?.includes(to) ?? false;
    }
    private setState(newState: ConnectorState): void {
        if (!this.isValidStateTransition(this.state, newState)) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid state transition from ${this.state} to ${newState}`
            );
        }

        const previousState = this.state;
        this.state = newState;
        this.stateTimestamp = Date.now();

        const event: StateChangeEvent = {
            previousState,
            currentState: newState,
            timestamp: this.stateTimestamp,
        };

        this.emit("stateChange", event);
        this.updateMetrics();
    }

    private handleMessage(data: unknown): void {
        try {
            this.metrics.messageCount++;
            this.emit("message", data);
        } catch (error) {
            this.handleError(error);
        }
    }

    private handleError(error: unknown): void {
        this.metrics.errorCount++;

        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.CONNECTION_FAILED,
                      error instanceof Error
                          ? error.message
                          : "Unknown error occurred",
                      error instanceof Error ? error : undefined
                  );

        this.setState(ConnectorState.ERROR);
        this.emit("error", wsError);
    }

    private updateMetrics(): void {
        this.metrics.timestamp = Date.now();
        this.metrics.status = this.state;
    }

    getId(): string {
        return this.id;
    }

    getState(): ConnectorState {
        return this.state;
    }

    getMetrics(): ConnectorMetrics {
        return {
            ...this.metrics,
            timestamp: Date.now(),
        };
    }
}
