/**
 * @file src/modules/base-module.ts
 * @description 모듈 기본 클래스 구현
 */
import {
    ModuleType,
    State,
    StateType,
    HealthStatus,
    ModuleMetrics,
} from "../types";

interface BaseModuleConfig {
    id: string;
    type: ModuleType;
}

export abstract class BaseModule {
    readonly id: string;
    readonly type: ModuleType;
    private state: State;
    private startTime: number;
    private lastStateChange: number;
    private metrics: ModuleMetrics;

    constructor(config: BaseModuleConfig) {
        this.id = config.id;
        this.type = config.type;
        this.startTime = Date.now();
        this.lastStateChange = Date.now();
        this.state = {
            type: StateType.INIT,
            since: this.lastStateChange,
            metadata: {},
        };
        this.metrics = {
            memory: 0,
            uptime: 0,
            events: { processed: 0, failed: 0 },
        };
    }

    getState(): State {
        return this.state;
    }

    getHealth(): HealthStatus {
        return {
            status: "healthy",
            currentState: this.state.type,
            lastStateChange: this.lastStateChange,
            uptime: Date.now() - this.startTime,
        };
    }

    protected updateMetrics(update: Partial<ModuleMetrics>): void {
        this.metrics = {
            ...this.metrics,
            ...update,
            events: {
                ...this.metrics.events,
                ...(update.events || {}),
            },
        };
    }

    getMetrics(): ModuleMetrics {
        return {
            ...this.metrics,
            memory: process.memoryUsage().heapUsed,
            uptime: Date.now() - this.startTime,
        };
    }

    async start(): Promise<void> {
        this.lastStateChange = Date.now();
        this.state = {
            type: StateType.RUNNING,
            since: this.lastStateChange,
            metadata: {},
        };
    }

    async stop(): Promise<void> {
        this.lastStateChange = Date.now();
        this.state = {
            type: StateType.STOPPED,
            since: this.lastStateChange,
            metadata: {},
        };
    }
}
