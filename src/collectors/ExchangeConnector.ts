/**
 * Path: src/collectors/ExchangeConnector.ts
 * WebSocket 기반 거래소 연결 및 데이터 수집을 위한 기본 클래스
 */

import { EventEmitter } from "events";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../errors/types";
import {
    ConnectorState,
    StateTransitionEvent,
    validStateTransitions,
} from "../states/types";
import { IExchangeConnector, SymbolGroup } from "./types";
import { WebSocketMessage } from "../websocket/types";
import { ConnectorMetrics } from "../types/metrics";
import { ErrorHandler, IErrorHandler } from "../errors/ErrorHandler";
import { BookTickerData, ExchangeInfo } from "../exchanges/common/types";
import { BookTickerStorage } from "../exchanges/common/BookTickerStorage";
import { IWebSocketManager } from "../websocket/IWebSocketManager";

interface SubscriptionStatus {
    symbol: string;
    status: "active" | "failed" | "pending" | "unsubscribed";
    lastUpdated: number;
    errorCount: number;
    lastError?: Error;
    lastMessageReceived?: number;
}

abstract class ExchangeConnector
    extends EventEmitter
    implements IExchangeConnector
{
    protected errorHandler: IErrorHandler;
    protected state: ConnectorState = ConnectorState.INITIAL;
    protected metrics: ConnectorMetrics;
    protected stateTimestamp: number;
    protected recoveryAttempts: number = 0;

    protected readonly MAX_RECOVERY_ATTEMPTS = 3;
    protected readonly HEALTH_CHECK_INTERVAL = 30000; // 30초
    private readonly MESSAGE_TIMEOUT = 60000; // 60초
    private readonly MAX_ERRORS_PER_SYMBOL = 5;
    private readonly BATCH_SIZE = 10; // 구독 배치 크기
    private readonly BATCH_INTERVAL = 100; // 배치 간 간격 (ms)

    private subscriptionStatuses: Map<string, SubscriptionStatus> = new Map();
    private healthCheckTimer?: NodeJS.Timer;
    private partialRecoveryInProgress = false;
    protected failedSymbols: Set<string> = new Set();
    private recoveryHistory: Array<{
        timestamp: number;
        type: "full" | "partial";
        symbols: string[];
        success: boolean;
        error?: Error;
    }> = [];

    constructor(
        protected readonly id: string,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        console.log("ExchangeConnector constructor", id, symbols.length);
        super();
        this.stateTimestamp = Date.now();
        this.errorHandler = new ErrorHandler(
            async () => this.handleFatalError(),
            (error) => this.emit("error", error)
        );
        this.metrics = this.initializeMetrics();
        this.initializeSubscriptionStatuses();
        this.setupEventHandlers();
        this.startHealthCheck();
    }

    // 거래소별로 구현해야 하는 추상 메서드들
    public abstract formatSubscriptionRequest(symbols: string[]): unknown;
    protected abstract formatUnsubscriptionRequest(symbols: string[]): unknown;
    protected abstract validateExchangeMessage(data: unknown): boolean;
    protected abstract normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData>;
    static fetchSpotExchangeInfo: () => Promise<ExchangeInfo[]>;
    static fetchFuturesExchangeInfo: () => Promise<ExchangeInfo[]>;

    private initializeMetrics(): ConnectorMetrics {
        const wsMetrics = this.wsManager.getMetrics();
        return {
            timestamp: Date.now(),
            status: this.state,
            messageCount: wsMetrics.totalMessages.count,
            errorCount: wsMetrics.errors.count,
            id: this.id,
            symbols: this.symbols,
            state: this.state,
        } as ConnectorMetrics;
    }

    private initializeSubscriptionStatuses(): void {
        this.symbols.forEach((symbol) => {
            this.subscriptionStatuses.set(symbol, {
                symbol,
                status: "pending",
                lastUpdated: Date.now(),
                errorCount: 0,
            });
        });
    }

    private setupEventHandlers(): void {
        this.wsManager.on("stateChange", this.handleStateChange.bind(this));
        this.wsManager.on("message", this.handleMessage.bind(this));
        this.wsManager.on("error", this.handleError.bind(this));
    }

    private async startHealthCheck(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.healthCheckTimer = setInterval(() => {
                this.checkSubscriptionHealth();
            }, this.HEALTH_CHECK_INTERVAL);

            // Health check 시작이 즉시 완료되는 경우 resolve 호출
            resolve();
        });
    }

    private async handleStateChange(
        event: StateTransitionEvent
    ): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                console.log(
                    "ExchangeConnector State change:",
                    event.previousState,
                    "->",
                    event.currentState
                );
                const previousState = this.state;

                if (
                    !this.isValidStateTransition(
                        previousState,
                        event.currentState
                    )
                ) {
                    throw new WebSocketError(
                        ErrorCode.INVALID_STATE,
                        `Invalid state transition from ${previousState} to ${event.currentState}`
                    );
                }

                this.state = event.currentState;
                this.stateTimestamp = event.timestamp;

                if (event.currentState === ConnectorState.CONNECTED) {
                    await this.handleConnectionEstablished(previousState);
                    await this.validateSubscriptions(); // 구독 상태 검증 추가
                } else if (
                    event.currentState === ConnectorState.ERROR ||
                    event.currentState === ConnectorState.DISCONNECTED
                ) {
                    this.failedSymbols.clear();
                    this.resetSubscriptionStatuses();
                }

                this.updateMetrics();
                this.emit("stateChange", {
                    ...event,
                    metadata: {
                        recoveryAttempts: this.recoveryAttempts,
                        failedSymbols: Array.from(this.failedSymbols),
                        subscriptionStats: this.getSubscriptionStats(),
                    },
                });

                resolve();
            } catch (error) {
                this.handleError(error);
                reject(error);
            }
        });
    }
    // 1. 구독 상태 검증 로직 추가
    private async validateSubscriptions(): Promise<void> {
        const stats = this.getSubscriptionStats();
        if (stats.active < this.symbols.length) {
            const inactiveSymbols = Array.from(
                this.subscriptionStatuses.entries()
            )
                .filter(([_, status]) => status.status !== "active")
                .map(([symbol]) => symbol);

            await this.handlePartialFailure(inactiveSymbols);
        }
    }

    // 2. 부분 복구 재시도 로직
    private async handlePartialFailure(failedSymbols: string[]): Promise<void> {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                await this.performPartialRecovery(failedSymbols);
                break;
            } catch (error) {
                retryCount++;
                if (retryCount === maxRetries) {
                    await this.handleCriticalFailure(failedSymbols, error);
                }
                await new Promise((resolve) =>
                    setTimeout(resolve, 1000 * retryCount)
                );
            }
        }
    }

    // 3. 치명적 오류 처리 개선
    private async handleCriticalFailure(
        failedSymbols: string[],
        error: unknown
    ): Promise<void> {
        this.emit("criticalFailure", {
            symbols: failedSymbols,
            error,
            timestamp: Date.now(),
        });

        if (failedSymbols.length === this.symbols.length) {
            // 전체 실패 시
            await this.handleFatalError();
        } else {
            // 부분 실패 시 해당 심볼들만 실패 처리
            failedSymbols.forEach((symbol) => {
                this.failedSymbols.add(symbol);
                this.updateSubscriptionStatus(symbol, "failed", error as Error);
            });
        }
    }

    private async handleConnectionEstablished(
        previousState: ConnectorState
    ): Promise<void> {
        try {
            if (
                previousState === ConnectorState.ERROR ||
                previousState === ConnectorState.DISCONNECTED
            ) {
                await this.attemptRecovery();
            } else if (previousState === ConnectorState.CONNECTING) {
                await this.subscribe();
            }
        } catch (error) {
            await this.handleCriticalFailure(this.symbols, error);
            throw error;
        }
    }
    private resetSubscriptionStatuses(): void {
        for (const [symbol, status] of this.subscriptionStatuses) {
            if (status.status !== "unsubscribed") {
                this.updateSubscriptionStatus(symbol, "pending");
            }
        }
    }

    private async checkSubscriptionHealth(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (this.state !== ConnectorState.SUBSCRIBED) {
                resolve(); // SUBSCRIBED 상태가 아니면 작업 완료로 처리
                return;
            }

            const now = Date.now();
            const unhealthySymbols: string[] = [];

            try {
                for (const [symbol, status] of this.subscriptionStatuses) {
                    if (status.status === "active") {
                        const messageAge =
                            now - (status.lastMessageReceived || 0);
                        if (messageAge > this.MESSAGE_TIMEOUT) {
                            unhealthySymbols.push(symbol);
                        }
                    }
                }

                if (
                    unhealthySymbols.length > 0 &&
                    !this.partialRecoveryInProgress
                ) {
                    await this.performPartialRecovery(unhealthySymbols);
                }

                resolve(); // 작업 성공 시 resolve 호출
            } catch (error) {
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    private async performPartialRecovery(symbols: string[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.partialRecoveryInProgress = true;

            try {
                // 비동기 구독 해제 및 재구독 작업 실행
                await Promise.all(
                    symbols.map((symbol) => this.unsubscribeSymbol(symbol))
                );
                await this.subscribeSymbols(symbols);

                // 부분 복구 완료 이벤트 발생
                this.emit("partialRecoveryComplete", {
                    recoveredSymbols: symbols,
                    timestamp: Date.now(),
                    recoveryAttempts: this.recoveryAttempts,
                });

                resolve(); // 성공적으로 완료 시 resolve 호출
            } catch (error) {
                // 복구 실패 이벤트 발생
                this.emit("partialRecoveryFailed", {
                    symbols,
                    error,
                    timestamp: Date.now(),
                });

                reject(error); // 에러 발생 시 reject 호출
            } finally {
                // 상태 초기화
                this.partialRecoveryInProgress = false;
            }
        });
    }

    protected async subscribe(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (this.state !== ConnectorState.CONNECTED) {
                const error = new WebSocketError(
                    ErrorCode.INVALID_STATE,
                    "Cannot subscribe: WebSocket is not connected"
                );
                reject(error); // 연결되지 않은 상태일 경우 reject 호출
                return;
            }

            this.setState(ConnectorState.SUBSCRIBING);
            // console.log(
            //     "ExchangeConnector Subscribing to symbols:",
            //     this.subscriptionStatuses.values()
            // );
            const pendingSymbols = Array.from(
                this.subscriptionStatuses.values()
            )
                .filter((status) => status.status !== "active")
                .map((status) => status.symbol);

            console.log(
                "ExchangeConnector Pending symbols:",
                pendingSymbols.length
            );
            try {
                await this.subscribeSymbols(pendingSymbols);

                const activeSubscriptions = Array.from(
                    this.subscriptionStatuses.values()
                ).filter((status) => status.status === "active").length;

                console.log(
                    "ExchangeConnector Subscription complete",
                    this.subscriptionStatuses.size
                );

                if (activeSubscriptions === 0) {
                    const subscriptionError = new WebSocketError(
                        ErrorCode.SUBSCRIPTION_FAILED,
                        "All subscriptions failed"
                    );
                    this.setState(ConnectorState.ERROR);
                    reject(subscriptionError); // 모든 구독 실패 시 reject 호출
                    return;
                }

                this.setState(ConnectorState.SUBSCRIBED);
                resolve(); // 성공적으로 완료 시 resolve 호출
            } catch (error) {
                this.setState(ConnectorState.ERROR);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }
    public async unsubscribe(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            // 이미 구독 해제 상태거나 연결되지 않은 상태라면 바로 resolve
            if (
                this.state === ConnectorState.DISCONNECTED ||
                this.state === ConnectorState.INITIAL
            ) {
                resolve();
                return;
            }

            // activeSymbols를 try 블록 밖에서 선언
            const activeSymbols = Array.from(this.subscriptionStatuses.values())
                .filter((status) => status.status === "active")
                .map((status) => status.symbol);

            if (activeSymbols.length === 0) {
                resolve();
                return;
            }

            try {
                // 구독 해제 요청 전송
                const request = this.formatUnsubscriptionRequest(activeSymbols);
                await this.wsManager.send(request);

                // 모든 구독 상태를 unsubscribed로 업데이트
                activeSymbols.forEach((symbol) => {
                    this.updateSubscriptionStatus(symbol, "unsubscribed");
                    this.failedSymbols.delete(symbol);
                });

                // 상태 업데이트
                if (this.state === ConnectorState.SUBSCRIBED) {
                    this.setState(ConnectorState.CONNECTED);
                }

                resolve();
            } catch (error) {
                // 구독 해제 실패 시 에러 처리
                activeSymbols.forEach((symbol) => {
                    this.updateSubscriptionStatus(
                        symbol,
                        "failed",
                        error as Error
                    );
                });
                reject(error);
            }
        });
    }
    protected async subscribeSymbols(symbols: string[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                for (let i = 0; i < symbols.length; i += this.BATCH_SIZE) {
                    const batch = symbols.slice(i, i + this.BATCH_SIZE);
                    try {
                        const request = this.formatSubscriptionRequest(batch);
                        await this.wsManager.send(request);

                        // 성공한 구독에 대해 상태 업데이트
                        batch.forEach((symbol) => {
                            this.updateSubscriptionStatus(symbol, "active");
                        });
                    } catch (error) {
                        // 실패한 구독에 대해 상태 업데이트
                        batch.forEach((symbol) => {
                            this.failedSymbols.add(symbol);
                            this.updateSubscriptionStatus(
                                symbol,
                                "failed",
                                error as Error
                            );
                        });
                    }

                    // 레이트 리밋 방지를 위한 딜레이
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.BATCH_INTERVAL)
                    );
                }
                resolve(); // 모든 배치 작업 완료 후 resolve 호출
            } catch (error) {
                reject(error); // 예기치 않은 오류 발생 시 reject 호출
            }
        });
    }

    private async unsubscribeSymbol(symbol: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const request = this.formatUnsubscriptionRequest([symbol]);
                await this.wsManager.send(request);

                // 구독 상태 업데이트
                this.updateSubscriptionStatus(symbol, "unsubscribed");
                this.failedSymbols.delete(symbol);

                resolve(); // 작업 성공 시 resolve 호출
            } catch (error) {
                // 구독 해제 실패 상태 업데이트
                this.updateSubscriptionStatus(symbol, "failed", error as Error);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    protected async attemptRecovery(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (this.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
                this.setState(ConnectorState.DISCONNECTED);
                resolve(); // 복구 시도 한도에 도달하면 작업 완료 처리
                return;
            }

            this.recoveryAttempts++;

            try {
                const delayMs = Math.min(
                    1000 * Math.pow(2, this.recoveryAttempts - 1),
                    5000
                );

                await new Promise((resolve) => setTimeout(resolve, delayMs));
                await this.subscribe();

                this.recoveryAttempts = 0;
                this.failedSymbols.clear();
                resolve(); // 복구가 성공적으로 완료되면 resolve 호출
            } catch (error) {
                if (this.recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
                    await this.attemptRecovery();
                } else {
                    this.setState(ConnectorState.ERROR);
                    reject(error); // 복구 실패 시 reject 호출
                }
            }
        });
    }

    protected async handleMessage(data: unknown): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                if (this.validateExchangeMessage(data)) {
                    const normalized = this.normalizeExchangeMessage(data);
                    const bookTickerData = normalized.data;

                    // Redis에 저장
                    try {
                        await BookTickerStorage.getInstance().storeBookTicker(
                            bookTickerData
                        );
                    } catch (error) {
                        console.error("Failed to store book ticker:", error);
                        // 저장 실패는 전체 프로세스를 중단시키지 않음
                    }

                    const status = this.subscriptionStatuses.get(
                        normalized.symbol
                    );
                    if (status) {
                        this.subscriptionStatuses.set(normalized.symbol, {
                            ...status,
                            lastMessageReceived: Date.now(),
                        });
                    }

                    this.metrics.messageCount++;
                    this.emit("message", normalized);
                }
                resolve(); // 메시지 처리 완료 시 resolve 호출
            } catch (error) {
                this.handleError(error);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    protected handleError(error: unknown): void {
        this.metrics.errorCount++;
        const wsError = this.errorHandler.handleWebSocketError(error);
        this.emit("error", wsError);
    }

    protected async handleFatalError(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await this.stop();
                resolve(); // 성공적으로 완료되면 resolve 호출
            } catch (error) {
                console.error(
                    "ExchangeConnector Failed to stop after fatal error:",
                    error
                );
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    public async start(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (this.state !== ConnectorState.INITIAL) {
                reject(
                    this.errorHandler.handleError(
                        new WebSocketError(
                            ErrorCode.INVALID_STATE,
                            "Connector can only be started from INITIAL state",
                            undefined,
                            ErrorSeverity.HIGH
                        )
                    )
                );
                return;
            }

            try {
                // 상태 전환 로직이 필요한 경우 여기에 추가
                // console.log(`ExchangeConnector Starting connector ${this.id}`);
                await this.wsManager.connect();
                // console.log("ExchangeConnector Connected to WebSocket");
                resolve(); // 작업이 성공적으로 완료되면 resolve 호출
            } catch (error) {
                this.handleError(error);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    public async stop(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            console.log("ExchangeConnector Stopping connector...");
            // this.setState(ConnectorState.DISCONNECTING);
            try {
                console.log(`ExchangeConnector Stopping connector ${this.id}`);
                await this.wsManager.disconnect();
                console.log("ExchangeConnector Disconnected from WebSocket");
                // this.setState(ConnectorState.DISCONNECTED);
                this.cleanup();
                resolve(); // 작업이 성공적으로 완료되면 resolve 호출
            } catch (error) {
                this.handleError(error);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    public async reconnect(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await this.stop(); // WebSocket 연결 종료
                await this.start(); // WebSocket 연결 시작
                resolve(); // 성공적으로 완료되면 resolve 호출
            } catch (error) {
                this.handleError(error);
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    public setState(state: ConnectorState): void {
        console.log("ExchangeConnector State change:", this.state, "->", state);
        const previousState = this.state;

        if (!this.isValidStateTransition(previousState, state)) {
            console.log(
                "ExchangeConnector State updated1:",
                previousState,
                state
            );
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid state transition from ${previousState} to ${state}`
            );
        }
        this.state = state;
        this.stateTimestamp = Date.now();

        const event: StateTransitionEvent = {
            id: this.getId(),
            previousState,
            currentState: state,
            timestamp: this.stateTimestamp,
        };
        // 여기서 stateChange 이벤트를 emit 합니다
        this.emit("stateChange", event);
        this.updateMetrics();
    }

    protected updateMetrics(): void {
        const wsMetrics = this.wsManager.getMetrics();
        const now = Date.now();

        this.metrics = {
            ...this.metrics,
            timestamp: now,
            status: this.state,
            state: this.state,
            messageCount:
                this.state === ConnectorState.SUBSCRIBED
                    ? wsMetrics.totalMessages.count
                    : this.metrics.messageCount,
            errorCount: wsMetrics.errors.count,
        };

        this.emit("metricsUpdated", this.metrics);
    }

    private updateSubscriptionStatus(
        symbol: string,
        status: SubscriptionStatus["status"],
        error?: Error
    ): void {
        const currentStatus = this.subscriptionStatuses.get(symbol);
        if (currentStatus) {
            const newStatus: SubscriptionStatus = {
                ...currentStatus,
                status,
                lastUpdated: Date.now(),
                errorCount: error
                    ? currentStatus.errorCount + 1
                    : currentStatus.errorCount,
                lastError: error,
            };
            this.subscriptionStatuses.set(symbol, newStatus);

            this.emit("subscriptionStatusChange", {
                symbol,
                oldStatus: currentStatus.status,
                newStatus: status,
                error,
                timestamp: Date.now(),
            });
        }
    }

    public cleanup(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
        this.subscriptionStatuses.clear();
        this.failedSymbols.clear();
        this.partialRecoveryInProgress = false;
        this.recoveryAttempts = 0;
    }

    // Getters and Utility Methods 계속
    public getId(): string {
        return this.id;
    }

    public getState(): ConnectorState {
        return this.state;
    }

    public getMetrics(): ConnectorMetrics {
        return {
            ...this.metrics,
            timestamp: Date.now(),
        };
    }

    public getSubscriptionStatus(
        symbol: string
    ): SubscriptionStatus | undefined {
        return this.subscriptionStatuses.get(symbol);
    }

    public getActiveSubscriptions(): string[] {
        return Array.from(this.subscriptionStatuses.values())
            .filter((status) => status.status === "active")
            .map((status) => status.symbol);
    }

    public getFailedSymbols(): string[] {
        return Array.from(this.failedSymbols);
    }

    public hasFailedSubscriptions(): boolean {
        return this.failedSymbols.size > 0;
    }

    public isHealthy(): boolean {
        const stats = this.getSubscriptionStats();
        return stats.active > 0 && stats.errorRate < 0.5;
    }

    public async resubscribe(symbols?: string[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            const targetSymbols = symbols || Array.from(this.failedSymbols);
            if (targetSymbols.length === 0) {
                resolve(); // 재구독할 심볼이 없으면 작업 성공으로 처리
                return;
            }

            try {
                await this.unsubscribeSymbols(targetSymbols); // 기존 구독 취소
                await this.subscribeSymbols(targetSymbols); // 새로운 구독 시작

                this.emit("resubscribeComplete", {
                    symbols: targetSymbols,
                    timestamp: Date.now(),
                });

                resolve(); // 성공적으로 완료되면 resolve 호출
            } catch (error) {
                this.emit("resubscribeFailed", {
                    symbols: targetSymbols,
                    error,
                    timestamp: Date.now(),
                });

                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    protected async unsubscribeSymbols(symbols: string[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                for (let i = 0; i < symbols.length; i += this.BATCH_SIZE) {
                    const batch = symbols.slice(i, i + this.BATCH_SIZE);
                    try {
                        const request = this.formatUnsubscriptionRequest(batch);
                        await this.wsManager.send(request);

                        batch.forEach((symbol) => {
                            this.updateSubscriptionStatus(
                                symbol,
                                "unsubscribed"
                            );
                            this.failedSymbols.delete(symbol);
                        });
                    } catch (error) {
                        batch.forEach((symbol) => {
                            this.updateSubscriptionStatus(
                                symbol,
                                "failed",
                                error as Error
                            );
                        });
                    }

                    // BATCH_INTERVAL 후에 다음 작업 실행
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.BATCH_INTERVAL)
                    );
                }
                resolve(); // 모든 작업이 완료되면 resolve 호출
            } catch (error) {
                reject(error); // 에러 발생 시 reject 호출
            }
        });
    }

    public getSubscriptionStats(): {
        total: number;
        active: number;
        failed: number;
        pending: number;
        unsubscribed: number;
        errorRate: number;
    } {
        const stats = {
            total: this.subscriptionStatuses.size,
            active: 0,
            failed: 0,
            pending: 0,
            unsubscribed: 0,
            errorRate: 0,
        };

        for (const status of this.subscriptionStatuses.values()) {
            stats[status.status]++;
        }

        stats.errorRate = stats.failed / stats.total;
        return stats;
    }

    private isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean {
        return validStateTransitions[from]?.includes(to) ?? false;
    }

    protected getSymbolSubscriptionInfo(symbol: string): {
        isActive: boolean;
        lastMessageAge: number;
        errorCount: number;
    } {
        const status = this.subscriptionStatuses.get(symbol);
        if (!status) {
            return {
                isActive: false,
                lastMessageAge: Infinity,
                errorCount: 0,
            };
        }

        return {
            isActive: status.status === "active",
            lastMessageAge: Date.now() - (status.lastMessageReceived || 0),
            errorCount: status.errorCount,
        };
    }

    protected shouldAttemptRecovery(symbol: string): boolean {
        const info = this.getSymbolSubscriptionInfo(symbol);
        return (
            info.errorCount < this.MAX_ERRORS_PER_SYMBOL &&
            this.recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS
        );
    }

    public getSubscriptionSummary(): {
        activeCount: number;
        failedCount: number;
        pendingCount: number;
        unsubscribedCount: number;
        totalErrors: number;
        lastUpdateTime: number;
    } {
        const stats = this.getSubscriptionStats();
        return {
            activeCount: stats.active,
            failedCount: stats.failed,
            pendingCount: stats.pending,
            unsubscribedCount: stats.unsubscribed,
            totalErrors: this.metrics.errorCount,
            lastUpdateTime: this.stateTimestamp,
        };
    }
}

export { ExchangeConnector, SubscriptionStatus };
