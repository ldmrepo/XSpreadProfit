/**
 * @file src/modules/collector.ts
 * @description 시장 데이터 수집기 구현
 */

import WebSocket from "ws";
import { EventEmitter } from "events";
import { BaseModule } from "./base-module";
import { ModuleType } from "../types";

interface CollectorConfig {
    id: string;
    url: string;
}

export class MarketDataCollector extends BaseModule {
    private ws: WebSocket | null = null;
    private url: string;
    private eventEmitter: EventEmitter;

    constructor(config: CollectorConfig) {
        super({
            id: config.id,
            type: ModuleType.COLLECTOR,
        });
        this.url = config.url;
        this.eventEmitter = new EventEmitter();
    }

    async connect(): Promise<void> {
        if (this.isConnected()) {
            throw new Error("WebSocket is already connected");
        }

        return new Promise<void>((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.on("open", () => {
                    console.log("WebSocket 연결됨");
                    resolve();
                });

                this.ws.on("error", (error) => {
                    console.error("WebSocket 에러:", error);
                    reject(error);
                });

                this.ws.on("message", (data: WebSocket.Data) => {
                    this.handleMessage(data);
                });

                this.ws.on("close", () => {
                    console.log("WebSocket 연결 종료됨");
                    this.ws = null;
                });
            } catch (error) {
                console.error("WebSocket 연결 실패:", error);
                reject(error);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (!this.isConnected()) {
            throw new Error("WebSocket is not connected");
        }

        return new Promise<void>((resolve) => {
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
            resolve();
        });
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    on(event: string, listener: (...args: any[]) => void): void {
        this.eventEmitter.on(event, listener);
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const parsed = JSON.parse(data.toString());
            console.log("메시지 수신:", parsed);

            const currentMetrics = this.getMetrics();
            this.updateMetrics({
                events: {
                    processed: currentMetrics.events.processed + 1,
                    failed: currentMetrics.events.failed,
                },
            });

            this.eventEmitter.emit("messageProcessed", parsed);
        } catch (error) {
            console.error("메시지 처리 에러:", error);
            const currentMetrics = this.getMetrics();
            this.updateMetrics({
                events: {
                    processed: currentMetrics.events.processed,
                    failed: currentMetrics.events.failed + 1,
                },
            });

            this.eventEmitter.emit("messageError", error);
        }
    }

    override async start(): Promise<void> {
        await super.start();
        await this.connect();
    }

    override async stop(): Promise<void> {
        if (this.isConnected()) {
            await this.disconnect();
        }
        await super.stop();
    }
}
