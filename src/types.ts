// src/types.ts
/**
 * @file src/types.ts
 * @description 시장 데이터 수집 시스템의 공통 타입 정의
 */

export enum ModuleType {
    COLLECTOR = "COLLECTOR",
    PROCESSOR = "PROCESSOR",
    PUBLISHER = "PUBLISHER",
}

export enum StateType {
    INIT = "INIT",
    STARTING = "STARTING",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    STOPPING = "STOPPING",
    STOPPED = "STOPPED",
    ERROR = "ERROR",
}

export interface State {
    type: StateType;
    since: number;
    metadata: Record<string, any>;
}

export interface HealthStatus {
    status: "healthy" | "unhealthy";
    currentState: StateType;
    lastStateChange: number;
    uptime: number;
}

export interface ModuleMetrics {
    memory: number;
    uptime: number;
    events: {
        processed: number;
        failed: number;
    };
}
