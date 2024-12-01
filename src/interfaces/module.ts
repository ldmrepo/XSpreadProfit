// src/interfaces/module.ts
/**
 * @file src/interfaces/module.ts
 * @description 모듈 기본 인터페이스 정의
 */

import { ModuleType, State, HealthStatus, ModuleMetrics } from "../types";

export interface Module {
    readonly id: string;
    readonly type: ModuleType;

    // 구독/해지
    subscribe(symbol: string[]): Promise<void>;
    unsubscribe(symbol: string[]): Promise<void>;

    // 생명주기
    start(): Promise<void>;
    stop(): Promise<void>;

    // 관리 기능
    getState(): State;
    getHealth(): HealthStatus;
    getMetrics(): ModuleMetrics;
}
