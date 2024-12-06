/**
 * Path: src/collectors/types.ts
 * 수집기 관련 공통 타입 정의
 */

import {
    CollectorMetrics,
    ConnectorMetrics,
    ManagerMetrics,
} from "../types/metrics"
import { EventEmitter } from "events"

export type SymbolGroup = string[]
export type ConnectorId = string

export interface ICollector {
    start(symbols: string[]): Promise<void>
    stop(): Promise<void>
    getMetrics(): Promise<CollectorMetrics> // Metrics -> CollectorMetrics
}

export interface IConnectorManager {
    initialize(symbols: string[]): Promise<void>
    stop(): Promise<void>
    getMetrics(): ManagerMetrics
}

export interface IExchangeConnector extends EventEmitter {
    start(): Promise<void>
    stop(): Promise<void>
    getId(): string
    getState(): string
    getMetrics(): ConnectorMetrics
}
