/**
 * @file src/modules/binance-collector.ts
 * @description Binance 거래소 데이터 수집기 구현
 */

import WebSocket, { RawData } from "ws";
import axios from "axios";
import { ExchangeCollectorBase } from "./exchange-collector-base";
import { ModuleType, StateType } from "../types";
import { BinanceDataTransformer } from "./binance-data-transformer";
import { CoreMetrics } from "../types/module-metrics";

interface CollectorConfig {
    id: string;
    wsUrl: string;
    restUrl: string;
    maxSymbolsPerGroup: number;
}

enum CollectorMode {
    WEBSOCKET,
    REST,
}

interface RetryConfig {
    initialDelay: number;
    maxDelay: number;
    maxAttempts: number;
}

export class BinanceCollector extends ExchangeCollectorBase {
    protected metrics: CoreMetrics;

    private ws: WebSocket | null = null;
    private wsUrl: string;
    public restUrl: string;
    private maxSymbolsPerGroup: number;
    private requestId: number = 1;
    private pingTimer: NodeJS.Timeout | null = null;
    private connectionTimeoutTimer: NodeJS.Timeout | null = null;
    public retryConfig: RetryConfig = {
        initialDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 5,
    };
    private retryAttempts: number = 0;
    private retryTimer: NodeJS.Timeout | null = null; // retryConnection 타이머를 관리하기 위한 변수 추가

    private activeStreams: Set<string> = new Set();

    constructor(config: CollectorConfig) {
        super({
            id: config.id,
            type: ModuleType.COLLECTOR,
        });

        this.wsUrl = config.wsUrl;
        this.restUrl = config.restUrl;
        this.maxSymbolsPerGroup = config.maxSymbolsPerGroup;

        this.metrics = {
            memory: 0,
            uptime: 0,
            events: {
                processed: 0,
                failed: 0,
            },
            connection: {
                status: "DISCONNECTED",
                latency: 0,
            },
            performance: {
                throughput: 0,
                errorRate: 0,
            },
            subscription: {
                activeCount: 0,
                totalMessages: 0,
                failedMessages: 0,
            },
        };
    }

    public async start(): Promise<void> {
        if (this.getState().type === StateType.RUNNING) {
            // throw new Error("Collector is already running.");
            console.warn("Collector is already running.");
            return;
        }
        this.setState(StateType.RUNNING);
        console.log(`[${this.id}] Collector started.`);
        this.connect();
    }

    public async stop(): Promise<void> {
        if (this.getState().type !== StateType.RUNNING) {
            console.warn("Collector is not running.");
            return;
        }
        this.disconnect();
        this.setState(StateType.STOPPED);
        console.log(`[${this.id}] Collector stopped.`);
        this.clearAllTimers();
    }

    private disconnect(): void {
        if (this.ws) {
            console.log("Disconnecting Binance WebSocket...");
            this.ws.close();
            this.ws = null;
        }
        this.stopPingPong();
        this.clearConnectionTimeout();
        this.clearRetryTimer(); // retryConnection 타이머 클리어
    }

    private retryConnection(): void {
        if (this.retryAttempts < this.retryConfig.maxAttempts) {
            const delay = Math.min(
                this.retryConfig.initialDelay * 2 ** this.retryAttempts,
                this.retryConfig.maxDelay
            );
            console.log(
                `Attempting to reconnect in ${delay / 1000} seconds...`
            );
            this.retryTimer = setTimeout(() => {
                this.retryAttempts++;
                this.connect(); // 새로운 WebSocket 인스턴스 생성
            }, delay);
        } else {
            console.error("Max retry attempts reached. Could not reconnect.");

            // Collector의 상태를 STOPPED로 변경
            this.setState(StateType.STOPPED);
        }
    }

    private clearRetryTimer(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
            console.log("Retry timer cleared.");
        }
    }

    private clearAllTimers(): void {
        this.stopPingPong();
        this.clearConnectionTimeout();
        this.clearRetryTimer();
    }

    private connect(): void {
        if (this.ws) {
            console.log(
                "Closing existing WebSocket connection before reconnecting."
            );
            this.disconnect();
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => this.handleOpen());
        this.ws.on("message", (data) => this.handleMessage(data));
        this.ws.on("error", (error) => this.handleError(error));
        this.ws.on("close", () => this.handleClose());

        this.retryAttempts = 0; // 재연결 시도 횟수 초기화
    }

    public async subscribe(symbols: string[]): Promise<void> {
        if (this.getState().type !== StateType.RUNNING) {
            throw new Error("Collector must be running to subscribe.");
        }

        const streams = symbols.map(
            (symbol) => `${symbol.toLowerCase()}@depth`
        );
        streams.forEach((stream) => this.activeStreams.add(stream));

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({
                method: "SUBSCRIBE",
                params: streams,
                id: this.getNextRequestId(),
            });
            console.log(`Subscribed to streams: ${streams.join(", ")}`);
        } else {
            this.connectAndSubscribe(streams);
        }

        this.updateMetrics({
            subscription: {
                activeCount: this.activeStreams.size,
                totalMessages: this.metrics.subscription.totalMessages,
                failedMessages: this.metrics.subscription.failedMessages,
            },
        });
    }

    public async unsubscribe(symbols?: string[]): Promise<void> {
        if (symbols && symbols.length > 0) {
            const streams = symbols.map(
                (symbol) => `${symbol.toLowerCase()}@depth`
            );
            streams.forEach((stream) => this.activeStreams.delete(stream));

            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send({
                    method: "UNSUBSCRIBE",
                    params: streams,
                    id: this.getNextRequestId(),
                });
                console.log(`Unsubscribed from streams: ${streams.join(", ")}`);
            }
        } else {
            // 모든 구독 해제
            const streams = Array.from(this.activeStreams);
            this.activeStreams.clear();

            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send({
                    method: "UNSUBSCRIBE",
                    params: streams,
                    id: this.getNextRequestId(),
                });
                console.log("Unsubscribed from all streams.");
            }

            // 모든 구독이 해제되었으므로 WebSocket 연결 종료
            this.disconnect();
        }

        this.updateMetrics({
            subscription: {
                activeCount: this.activeStreams.size,
                totalMessages: this.metrics.subscription.totalMessages,
                failedMessages: this.metrics.subscription.failedMessages,
            },
        });
    }

    public listSubscriptions(): void {
        this.send({
            method: "LIST_SUBSCRIPTIONS",
            id: 999,
        });
        console.log("Requested list of active subscriptions.");
    }

    private connectAndSubscribe(streams: string[]): void {
        this.connect();
        this.ws?.once("open", () => {
            if (streams.length > 0) {
                this.send({
                    method: "SUBSCRIBE",
                    params: streams,
                    id: this.getNextRequestId(),
                });
                console.log(`Subscribed to streams: ${streams.join(", ")}`);
            }
        });
    }

    private handleOpen(): void {
        console.log("Binance WebSocket connection established.");
        this.updateMetrics({
            connection: { status: "CONNECTED", latency: 0 },
        });
        this.startPingPong();
        this.startConnectionTimeout();

        if (this.activeStreams.size > 0) {
            // 재연결 시 기존 구독 복원
            this.send({
                method: "SUBSCRIBE",
                params: Array.from(this.activeStreams),
                id: this.getNextRequestId(),
            });
            console.log(
                `Resubscribed to streams: ${Array.from(this.activeStreams).join(
                    ", "
                )}`
            );
        }
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());

            if (message.id) {
                if (message.id === 999) {
                    console.log("Active subscriptions:", message.result);
                } else {
                    console.log("Response:", message);
                }
            } else if (message.stream && message.data) {
                const standardizedData =
                    BinanceDataTransformer.transformToStandardFormat(
                        message.data
                    );
                this.emit("data", standardizedData);

                this.updateMetrics({
                    events: {
                        processed: this.metrics.events.processed + 1,
                        failed: this.metrics.events.failed,
                    },
                    subscription: {
                        activeCount: this.metrics.subscription.activeCount,
                        totalMessages:
                            this.metrics.subscription.totalMessages + 1,
                        failedMessages:
                            this.metrics.subscription.failedMessages,
                    },
                });
            } else {
                console.log("Received message:", message);
            }
        } catch (error) {
            console.error("Failed to parse message:", error);
            this.updateMetrics({
                events: {
                    processed: this.metrics.events.processed,
                    failed: this.metrics.events.failed + 1,
                },
            });
        }
    }

    private handleError(error: Error): void {
        console.error("WebSocket error:", error.message);
        this.updateMetrics({
            connection: { status: "ERROR", latency: 0 },
        });

        // REST API를 사용하여 데이터 수집 시도
        this.fetchDataFromRestApi();

        // 재연결 로직 추가
        this.retryConnection();
    }

    private handleClose(): void {
        console.log("WebSocket connection closed.");
        this.updateMetrics({
            connection: { status: "DISCONNECTED", latency: 0 },
        });
        this.stopPingPong();
        this.clearConnectionTimeout();

        // 재연결 로직 추가
        if (this.getState().type === StateType.RUNNING) {
            this.retryConnection();
        }
    }

    private async fetchDataFromRestApi(): Promise<void> {
        try {
            const symbols = Array.from(this.activeStreams).map((stream) =>
                stream.split("@")[0].toUpperCase()
            );
            for (const symbol of symbols) {
                const response = await axios.get(
                    `${this.restUrl}/api/v3/depth`,
                    {
                        params: {
                            symbol: symbol,
                            limit: 5, // 필요한 깊이로 설정
                        },
                    }
                );
                // 데이터를 처리하고 이벤트를 발생시킵니다.
                const standardizedData =
                    BinanceDataTransformer.transformToStandardFormat(
                        response.data
                    );
                this.emit("data", standardizedData);
            }
        } catch (error) {
            console.error("Failed to fetch data from REST API:", error);
        }
    }

    private startPingPong(): void {
        this.stopPingPong();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping();
                console.log("Ping frame sent to maintain connection.");
            }
        }, 3 * 60 * 1000); // 3분마다 Ping 전송
    }

    private stopPingPong(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
            console.log("Ping-Pong timer stopped.");
        }
    }

    private startConnectionTimeout(): void {
        this.clearConnectionTimeout();
        this.connectionTimeoutTimer = setTimeout(() => {
            console.log("24시간 경과하여 WebSocket 연결을 재시작합니다.");
            this.disconnect();
            this.connect();
        }, 24 * 60 * 60 * 1000); // 24시간 후 재연결
    }

    private clearConnectionTimeout(): void {
        if (this.connectionTimeoutTimer) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }
    }

    private send(payload: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error("WebSocket is not connected.");
        }
    }

    private getNextRequestId(): number {
        return this.requestId++;
    }

    // 접근 제한자를 protected로 변경하여 테스트에서 접근 가능하도록 수정
    protected groupSymbols(symbols: string[]): string[][] {
        const groups: string[][] = [];
        for (let i = 0; i < symbols.length; i += this.maxSymbolsPerGroup) {
            groups.push(symbols.slice(i, i + this.maxSymbolsPerGroup));
        }
        return groups;
    }
}
