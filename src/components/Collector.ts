/**
 * Collector (수집기)
 *
 * 거래소로부터 WebSocket을 통해 시장 데이터를 수집하는 컴포넌트
 * - WebSocket 연결 관리
 * - 데이터 수집 및 검증
 * - SharedBuffer를 통한 메모리 관리
 * - 이벤트 발행
 */

import WebSocket from "ws";
import axios from "axios";
import { Logger } from "../utils/logger";
import { SharedBuffer } from "../utils/SharedBuffer";
import { ExchangeAdapterInterface } from "../interfaces/ExchangeAdapterInterface";
import { EventManagerInterface } from "../interfaces/EventManagerInterface";
import { StateManagerInterface } from "../interfaces/StateManagerInterface";
import { MetricManagerInterface } from "../interfaces/MetricManagerInterface";
import { ErrorManagerInterface } from "../interfaces/ErrorManagerInterface";

import { CollectorConfig } from "../types/config";
import { RawMarketData } from "../types/data";
import { MetricType } from "../types/metrics";
import { ExchangeStatus } from "../types/exchange";

class Collector {
    private id: string;
    private exchangeId: string;
    private wsUrl: string;
    private ws: WebSocket | null;
    private adapter: ExchangeAdapterInterface;
    private eventManager: EventManagerInterface;
    private stateManager: StateManagerInterface;
    private metricManager: MetricManagerInterface;
    private errorManager: ErrorManagerInterface;
    private logger: Logger;

    // 연결 관리
    private reconnectAttempts: number;
    private maxReconnectAttempts: number;
    private reconnectInterval: number;
    private pingInterval: number;
    private pingTimeout: NodeJS.Timeout | null;

    // 데이터 관리
    private dataBuffer: SharedBuffer<RawMarketData>;
    private subscriptions: Set<string>;
    private seenDataSet: Set<string>;

    // REST API 대체 수집
    private restFallbackInterval!: NodeJS.Timeout | null;
    maxRestBackoff: number;
    restInterval: number;

    constructor(
        adapter: ExchangeAdapterInterface,
        config: CollectorConfig,
        managers: {
            eventManager: EventManagerInterface;
            stateManager: StateManagerInterface;
            metricManager: MetricManagerInterface;
            errorManager: ErrorManagerInterface;
        }
    ) {
        this.id = config.id;
        this.adapter = adapter;
        // 매니저 의존성 주입
        this.eventManager = managers.eventManager;
        this.stateManager = managers.stateManager;
        this.metricManager = managers.metricManager;
        this.errorManager = managers.errorManager;

        // 환경 파일에서 설정 읽기
        this.exchangeId = config.exchangeId;
        this.wsUrl = config.websocketUrl;
        this.logger = Logger.getInstance(`Collector:${this.id}`);

        // 초기화
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = config.wsConfig?.maxReconnectAttempts || 5;
        this.reconnectInterval = config.wsConfig?.reconnectInterval || 5000;
        this.pingInterval = config.wsConfig?.pingInterval || 30000;
        this.pingTimeout = null;

        // SharedBuffer 초기화
        this.dataBuffer = new SharedBuffer<RawMarketData>(
            `${this.id}_buffer`,
            {
                maxSize: config.bufferConfig?.maxSize || 1000,
                flushThreshold: 80,
                flushInterval: config.bufferConfig?.flushInterval || 1000,
            },
            async (items) => this.handleBufferFlush(items)
        );

        this.subscriptions = new Set();
        this.seenDataSet = new Set();

        this.restFallbackInterval = null;
        // Configurable settings
        this.maxRestBackoff = config.retryPolicy?.maxRetries || 30000; // 최대 백오프 시간
        this.restInterval = config.retryPolicy?.retryInterval || 5000; // REST 호출 주기
    }

    async start(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STARTING");
            const wsConfig = this.adapter.getWebSocketConfig();
            await this.connect();
            this.startHeartbeat();
            await this.stateManager.changeState(this.id, "RUNNING");
            this.logger.info(`Collector ${this.id} started successfully`);
        } catch (error: any) {
            await this.handleStartupError(error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STOPPING");
            this.disconnect();
            if (this.restFallbackInterval)
                clearInterval(this.restFallbackInterval);
            await this.dataBuffer.flush();
            await this.stateManager.changeState(this.id, "STOPPED");
            this.logger.info(`Collector ${this.id} stopped successfully`);
        } catch (error: any) {
            await this.handleStopError(error);
            throw error;
        }
    }

    async subscribe(symbols: string[]): Promise<void> {
        console.log("🚀 ~ Collector ~ subscribe ~ symbols:", symbols);
        try {
            const message = this.adapter.createSubscriptionMessage(symbols);

            if (message.length === 0) {
                this.logger.info("No new symbols to subscribe.");
                return;
            }
            await this.sendMessage(message);

            symbols.forEach((symbol) => this.subscriptions.add(symbol));
            this.logger.info(`Subscribed to symbols: ${symbols.join(", ")}`);
        } catch (error: any) {
            await this.handleSubscriptionError(error, symbols);
            throw error;
        }
    }

    async unsubscribe(symbols: string[]): Promise<void> {
        try {
            const message = this.createUnsubscriptionMessage(symbols);
            await this.sendMessage(message);
            symbols.forEach((symbol) => this.subscriptions.delete(symbol));
            this.logger.info(
                `Unsubscribed from symbols: ${symbols.join(", ")}`
            );
        } catch (error: any) {
            await this.handleUnsubscriptionError(error, symbols);
            throw error;
        }
    }

    private async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on("open", () => {
                this.logger.info("WebSocket connected.");
                this.reconnectAttempts = 0;
                this.resubscribe();
                resolve();
            });

            this.ws.on("message", async (data: WebSocket.Data) => {
                try {
                    const parsedData = JSON.parse(data.toString());
                    if (this.isUniqueData(parsedData)) {
                        await this.dataBuffer.push(parsedData);
                        this.updateDataMetrics(parsedData);
                    }
                } catch (error) {
                    this.logger.error(
                        "Error processing WebSocket message",
                        error
                    );
                }
            });

            this.ws.on("close", async () => {
                this.logger.warn("WebSocket connection closed.");
                await this.handleConnectionClose();
            });

            this.ws.on("error", (error) => {
                this.logger.error("WebSocket error", error);
                reject(error);
            });
        });
    }

    private isUniqueData(data: RawMarketData): boolean {
        const dataSignature = `${data.symbol}-${data.timestamp}`;
        if (this.seenDataSet.has(dataSignature)) {
            return false;
        }
        this.seenDataSet.add(dataSignature);
        if (this.seenDataSet.size > 10000) {
            this.seenDataSet.clear(); // Set 크기 제한
        }
        return true;
    }
    private disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private async handleBufferFlush(items: RawMarketData[]): Promise<void> {
        for (const item of items) {
            await this.eventManager.publish({
                type: "MARKET_DATA",
                payload: item,
                timestamp: Date.now(),
                source: this.id,
            });
        }
    }

    private startHeartbeat(): void {
        this.pingTimeout = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, this.pingInterval);
    }

    private async handleConnectionClose(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error(
                `WebSocket connection failed after ${this.reconnectAttempts} attempts. Starting REST fallback.`
            );
            await this.startRestFallback(); // REST API 대체 시작
        } else {
            this.reconnectAttempts++;
            this.logger.warn(
                `WebSocket reconnection attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}`
            );
            setTimeout(async () => {
                try {
                    await this.connect(); // WebSocket 복구 시도
                    this.logger.info("WebSocket reconnected successfully.");
                    await this.stopRestFallback(); // REST API 중단
                    await this.resubscribe(); // 구독 재개
                } catch (error) {
                    this.logger.error("WebSocket reconnection failed.", error);
                }
            }, this.reconnectInterval);
        }
    }

    private async startRestFallback(): Promise<void> {
        if (this.restFallbackInterval) return; // 이미 실행 중이면 중단

        let restBackoffAttempts = 0;

        const restFallbackLogic = async () => {
            try {
                const data = await this.fetchMarketDataViaRest();
                for (const item of data) {
                    if (this.isUniqueData(item)) {
                        await this.dataBuffer.push(item);
                    }
                }
                restBackoffAttempts = 0; // 성공 시 백오프 초기화
            } catch (error) {
                restBackoffAttempts++;
                const backoffTime = Math.min(
                    this.restInterval * 2 ** restBackoffAttempts,
                    this.maxRestBackoff
                );
                this.logger.error(
                    `REST API fallback failed (Attempt ${restBackoffAttempts}). Retrying in ${
                        backoffTime / 1000
                    } seconds.`,
                    error
                );
                clearInterval(this.restFallbackInterval!);
                setTimeout(() => {
                    this.restFallbackInterval = setInterval(
                        restFallbackLogic,
                        this.restInterval
                    );
                }, backoffTime);
            }
        };

        this.restFallbackInterval = setInterval(
            restFallbackLogic,
            this.restInterval
        );
    }

    private stopRestFallback(): void {
        if (this.restFallbackInterval) {
            clearInterval(this.restFallbackInterval);
            this.restFallbackInterval = null;
            this.logger.info("REST API fallback stopped");
        }
    }

    getRecoveryStatus(): Record<string, any> {
        return {
            websocketConnected: this.ws?.readyState === WebSocket.OPEN,
            restFallbackActive: !!this.restFallbackInterval,
            reconnectAttempts: this.reconnectAttempts,
        };
    }

    private async fetchMarketDataViaRest(): Promise<RawMarketData[]> {
        const response = await axios.get(`${this.wsUrl}/api/market-data`);
        return response.data;
    }

    private async resubscribe(): Promise<void> {
        const symbols = Array.from(this.subscriptions);
        if (symbols.length > 0) {
            const message = this.createSubscriptionMessage(symbols);
            await this.sendMessage(message);
            this.logger.info(`Resubscribed to symbols: ${symbols.join(", ")}`);
        }
    }

    private createSubscriptionMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "SUBSCRIBE",
            params: symbols,
            id: Date.now(),
        });
    }

    private createUnsubscriptionMessage(symbols: string[]): string {
        return JSON.stringify({
            method: "UNSUBSCRIBE",
            params: symbols,
            id: Date.now(),
        });
    }

    private async sendMessage(message: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }
        console.log("🚀 ~ Collector ~ sendMessage ~ message:", message);
        this.ws.send(message);
    }

    getStatus(): Record<string, any> {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            subscriptions: Array.from(this.subscriptions),
            bufferMetrics: this.dataBuffer.getMetrics(),
            reconnectAttempts: this.reconnectAttempts,
        };
    }
    private async handleStartupError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "FATAL",
            module: this.id,
            message: "Failed to start collector",
            timestamp: Date.now(),
            error,
            retryable: false,
        });

        await this.stateManager.changeState(this.id, "ERROR");
    }

    private async handleStopError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Error during collector shutdown",
            timestamp: Date.now(),
            error,
            retryable: false,
        });
    }

    private async handleSubscriptionError(
        error: Error,
        symbols: string[]
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Subscription error",
            timestamp: Date.now(),
            error,
            data: { symbols },
            retryable: true,
        });
    }

    private updateDataMetrics(data: RawMarketData): void {
        const symbol = data.symbol;

        // 심볼별 메트릭: 처리 건수 증가
        this.metricManager.collect({
            type: MetricType.COUNTER,
            module: this.id,
            name: `processed_messages.${symbol}`,
            value: 1,
            timestamp: Date.now(),
            tags: { symbol },
        });

        // 심볼별 처리 시간 계산 및 기록
        const processingTime = Date.now() - data.timestamp; // 예: 처리 시작과 현재 시간 차이
        this.metricManager.collect({
            type: MetricType.HISTOGRAM,
            module: this.id,
            name: `processing_time.${symbol}`,
            value: processingTime,
            timestamp: Date.now(),
            tags: { symbol },
        });

        // 심볼별 평균 처리 시간 업데이트
        this.metricManager.collect({
            type: MetricType.GAUGE,
            module: this.id,
            name: `avg_processing_time.${symbol}`,
            value: processingTime, // 심볼별 평균 계산은 MetricManager가 처리
            timestamp: Date.now(),
            tags: { symbol },
        });
    }

    private async handleUnsubscriptionError(
        error: Error,
        symbols: string[]
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Unsubscription error",
            timestamp: Date.now(),
            error,
            data: { symbols },
            retryable: true,
        });
    }

    public getSubscriptions(): string[] {
        return Array.from(this.subscriptions);
    }
}

export default Collector;
