// src/managers/MetricManager.ts
/**
 * MetricManager
 *
 * 시스템의 성능 지표와 운영 메트릭을 수집, 집계, 관리하는 매니저
 * - 성능 메트릭 수집
 * - 시스템 메트릭 집계
 * - 메트릭 저장 및 조회
 * - 임계치 모니터링
 */

import { Redis } from "ioredis"
import { Logger } from "../utils/logger"
import EventManager from "./EventManager"
import {
    Metric,
    MetricType,
    MetricValue,
    MetricQuery,
    AggregateResult,
    SystemMetrics,
    ComponentMetrics,
} from "../types/metrics"
import { MetricManagerConfig } from "../types/config"

class MetricManager {
    private static instance: MetricManager
    private metrics: Map<string, Metric[]> // Map<string, MetricValue[]>에서 Map<string, Metric[]>로 변경
    private aggregates: Map<string, AggregateResult>
    private redis?: Redis
    private eventManager: EventManager
    private logger: Logger
    private flushInterval: number
    private retentionPeriod: number

    private constructor() {
        this.metrics = new Map<string, Metric[]>()
        this.aggregates = new Map()
        this.eventManager = EventManager.getInstance()
        this.logger = Logger.getInstance("MetricManager")
        this.flushInterval = 60000 // 1분
        this.retentionPeriod = 86400000 // 24시간
    }

    static getInstance(): MetricManager {
        if (!MetricManager.instance) {
            MetricManager.instance = new MetricManager()
        }
        return MetricManager.instance
    }

    async initialize(config: MetricManagerConfig): Promise<void> {
        try {
            this.redis = new Redis(config.redisConfig)
            this.flushInterval = config.flushInterval || this.flushInterval
            this.retentionPeriod =
                config.retentionPeriod || this.retentionPeriod

            await this.startMetricCollection()
            await this.setupFlushInterval()

            this.logger.info("MetricManager initialized successfully")
        } catch (error) {
            this.logger.error("Failed to initialize MetricManager", error)
            throw error
        }
    }

    async collect(metric: Metric): Promise<void> {
        const key = `${metric.module}:${metric.name}`
        if (!this.metrics.has(key)) {
            this.metrics.set(key, [])
        }
        this.metrics.get(key)!.push(metric)
    }

    async collectBatch(metrics: Metric[]): Promise<void> {
        try {
            await Promise.all(metrics.map((metric) => this.collect(metric)))
        } catch (error) {
            this.logger.error("Failed to collect batch metrics", error)
            throw error
        }
    }

    async getMetrics(query: MetricQuery): Promise<MetricValue[]> {
        try {
            const key = this.getQueryKey(query)
            const values = this.metrics.get(key) || []
            return this.filterMetrics(values, query)
        } catch (error) {
            this.logger.error("Failed to get metrics", error)
            throw error
        }
    }

    async getAggregates(type: string): Promise<AggregateResult> {
        return (
            this.aggregates.get(type) || {
                count: 0,
                sum: 0,
                avg: 0,
                min: 0,
                max: 0,
            }
        )
    }

    private async flush(): Promise<void> {
        try {
            const now = Date.now()
            const batch = this.redis!.pipeline()

            for (const [key, values] of this.metrics.entries()) {
                // 오래된 메트릭 제거
                const validValues = values.filter(
                    (v) => now - v.timestamp < this.retentionPeriod
                )

                if (validValues.length > 0) {
                    batch.set(`metrics:${key}`, JSON.stringify(validValues))
                }

                this.metrics.set(key, validValues)
            }

            await batch.exec()
            this.logger.debug("Metrics flushed to Redis")
        } catch (error) {
            this.logger.error("Failed to flush metrics", error)
            throw error
        }
    }

    private async updateAggregates(key: string, metric: Metric): Promise<void> {
        const aggregate = this.aggregates.get(key) || {
            count: 0,
            sum: 0,
            avg: 0,
            min: Number.MAX_VALUE,
            max: Number.MIN_VALUE,
        }

        aggregate.count++
        aggregate.sum += metric.value
        aggregate.avg = aggregate.sum / aggregate.count
        aggregate.min = Math.min(aggregate.min, metric.value)
        aggregate.max = Math.max(aggregate.max, metric.value)

        this.aggregates.set(key, aggregate)
    }

    private getMetricKey(metric: Metric): string {
        return `${metric.type}:${metric.module}:${metric.name}`
    }

    private getQueryKey(query: MetricQuery): string {
        return `${query.type}:${query.module}:${query.name}`
    }

    private filterMetrics(
        values: MetricValue[],
        query: MetricQuery
    ): MetricValue[] {
        return values.filter(
            (value) =>
                (!query.startTime || value.timestamp >= query.startTime) &&
                (!query.endTime || value.timestamp <= query.endTime)
        )
    }

    private async setupFlushInterval(): Promise<void> {
        setInterval(() => {
            this.flush().catch((error) =>
                this.logger.error("Failed to flush metrics", error)
            )
        }, this.flushInterval)
    }

    private async startMetricCollection(): Promise<void> {
        // 시스템 메트릭 수집 시작
        setInterval(() => {
            this.collectSystemMetrics().catch((error) =>
                this.logger.error("Failed to collect system metrics", error)
            )
        }, 5000)
    }

    private async collectSystemMetrics(): Promise<void> {
        // SystemMetrics를 Metric 배열로 변환
        const systemMetrics = await this.getSystemMetrics()

        const metricsArray: Metric[] = [
            {
                type: MetricType.COUNTER,
                module: "system",
                name: "processed_events",
                value: systemMetrics.totalProcessedEvents,
                timestamp: Date.now(),
            },
            {
                type: MetricType.GAUGE,
                module: "system",
                name: "error_rate",
                value: systemMetrics.errorRate,
                timestamp: Date.now(),
            },
            {
                type: MetricType.GAUGE,
                module: "system",
                name: "memory_usage",
                value: systemMetrics.memoryUsage,
                timestamp: Date.now(),
            },
            {
                type: MetricType.GAUGE,
                module: "system",
                name: "uptime",
                value: systemMetrics.uptime,
                timestamp: Date.now(),
            },
        ]

        // 컴포넌트별 메트릭 추가
        Object.entries(systemMetrics.componentMetrics).forEach(
            ([component, metrics]) => {
                metricsArray.push(
                    {
                        type: MetricType.COUNTER,
                        module: component,
                        name: "processed_count",
                        value: metrics.processedCount,
                        timestamp: Date.now(),
                    },
                    {
                        type: MetricType.COUNTER,
                        module: component,
                        name: "error_count",
                        value: metrics.errorCount,
                        timestamp: Date.now(),
                    },
                    {
                        type: MetricType.GAUGE,
                        module: component,
                        name: "latency",
                        value: metrics.latency,
                        timestamp: Date.now(),
                    }
                )
            }
        )

        await this.collectBatch(metricsArray)
    }

    async getSystemMetrics(): Promise<SystemMetrics> {
        // 모든 메트릭을 하나의 배열로 변환
        const allMetrics: Metric[] = Array.from(this.metrics.values()).reduce(
            (acc, metrics) => acc.concat(metrics),
            []
        )

        const systemMetrics: SystemMetrics = {
            totalProcessedEvents:
                this.calculateTotalProcessedEvents(allMetrics),
            errorRate: this.calculateErrorRate(allMetrics),
            memoryUsage: process.memoryUsage().heapUsed,
            uptime: process.uptime(),
            componentMetrics: this.aggregateComponentMetrics(allMetrics),
        }

        return systemMetrics
    }
    private calculateTotalProcessedEvents(metrics: Metric[]): number {
        return metrics
            .filter(
                (m) =>
                    m.name === "processed_messages" &&
                    m.type === MetricType.COUNTER
            )
            .reduce((sum, m) => sum + m.value, 0)
    }

    private calculateErrorRate(metrics: Metric[]): number {
        const errors = metrics
            .filter((m) => m.name === "errors" && m.type === MetricType.COUNTER)
            .reduce((sum, m) => sum + m.value, 0)

        const total = metrics
            .filter(
                (m) =>
                    m.name === "processed_messages" &&
                    m.type === MetricType.COUNTER
            )
            .reduce((sum, m) => sum + m.value, 0)

        return total > 0 ? errors / total : 0
    }

    private aggregateComponentMetrics(
        metrics: Metric[]
    ): Record<string, ComponentMetrics> {
        const componentMetrics: Record<string, ComponentMetrics> = {}

        // 모듈별로 메트릭 집계
        for (const metric of metrics) {
            if (!componentMetrics[metric.module]) {
                componentMetrics[metric.module] = {
                    processedCount: 0,
                    errorCount: 0,
                    latency: 0,
                    lastProcessedTime: 0,
                }
            }

            // 메트릭 타입별 처리
            switch (metric.name) {
                case "processed_messages":
                    componentMetrics[metric.module].processedCount +=
                        metric.value
                    break
                case "errors":
                    componentMetrics[metric.module].errorCount += metric.value
                    break
                case "processing_time":
                    componentMetrics[metric.module].latency = metric.value
                    break
                case "last_processed":
                    componentMetrics[metric.module].lastProcessedTime =
                        metric.value
                    break
            }
        }

        return componentMetrics
    }
}

export default MetricManager
