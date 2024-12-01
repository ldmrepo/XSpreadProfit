/**
 * @file src/modules/exchange-collector-base.ts
 * @description 거래소 수집기의 기본 클래스
 */

import { EventEmitter } from "events";
import {
    ModuleType,
    State,
    StateType,
    HealthStatus,
    ModuleMetrics,
} from "../types";
import { Module } from "../interfaces/module";
import { CoreMetrics } from "module-metrics";

interface ExchangeCollectorConfig {
    id: string;
    type: ModuleType;
}

export abstract class ExchangeCollectorBase
    extends EventEmitter
    implements Module
{
    readonly id: string;
    readonly type: ModuleType;
    private state: State;
    // private metrics: ModuleMetrics;
    protected metrics: CoreMetrics; // private에서 protected로 변경

    protected activeSubscriptions: Map<number, string[]>; // 타입 변경

    constructor(config: ExchangeCollectorConfig) {
        super();
        this.id = config.id;
        this.type = config.type;
        this.state = {
            type: StateType.INIT,
            since: Date.now(),
            metadata: {},
        };
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
        this.activeSubscriptions = new Map();
    }

    // 생명주기 메서드
    async start(): Promise<void> {
        if (this.state.type === StateType.RUNNING) {
            throw new Error("Collector is already running.");
        }
        this.setState(StateType.RUNNING);
        console.log(`[${this.id}] Collector started.`);
    }

    async stop(): Promise<void> {
        if (this.state.type === StateType.INIT) {
            throw new Error("Collector is not running.");
        }
        this.setState(StateType.STOPPED);
        console.log(`[${this.id}] Collector stopped.`);
    }

    // 상태 관리
    getState(): State {
        return this.state;
    }

    getHealth(): HealthStatus {
        return {
            status: "healthy",
            currentState: this.state.type,
            lastStateChange: this.state.since,
            uptime: Date.now() - this.state.since,
        };
    }

    getMetrics(): CoreMetrics {
        return {
            ...this.metrics,
            memory: process.memoryUsage().heapUsed,
            uptime: Date.now() - this.state.since,
        };
    }

    // 구독 관리
    async subscribe(symbols: string[]): Promise<void> {
        console.log(`[${this.id}] Subscribing to symbols: ${symbols}`);
    }

    async unsubscribe(symbols?: string[]): Promise<void> {
        console.log(`[${this.id}] Unsubscribing from symbols: ${symbols}`);
    }

    // 상태 업데이트
    protected setState(newState: StateType): void {
        this.state = {
            type: newState,
            since: Date.now(),
            metadata: {},
        };
    }

    // 메트릭 업데이트
    protected updateMetrics(update: Partial<CoreMetrics>): void {
        this.metrics = {
            ...this.metrics,
            ...update,
            events: {
                processed:
                    update.events?.processed ?? this.metrics.events.processed,
                failed: update.events?.failed ?? this.metrics.events.failed,
            },
            connection: {
                ...this.metrics.connection,
                ...update.connection,
            },
            subscription: {
                ...this.metrics.subscription,
                ...update.subscription,
            },
        };
    }
}
