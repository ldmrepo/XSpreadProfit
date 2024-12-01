// src/interfaces/collector.ts
/**
 * @file src/interfaces/collector.ts
 * @description 데이터 수집기 인터페이스 정의
 */

import { Module } from "./module";

export interface Collector extends Module {
    // 수집 기능
    connect(): Promise<void>;
    disconnect(): Promise<void>;

    // 구독 관리
    subscribe(symbols: string[]): Promise<void>;
    unsubscribe(symbols: string[]): Promise<void>;

    // 상태 체크
    isConnected(): boolean;
    getSubscriptions(): string[];
}
