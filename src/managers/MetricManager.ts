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
} from "../types/metrics"
import { MetricManagerConfig } from "../types/config"

class MetricManager {
    private static instance: MetricManager
    private metrics: Map<string, MetricValue[]>
    private aggregates: Map<string, AggregateResult>
    private redis?: Redis
    private eventManager: EventManager
    private logger: Logger
    private flushInterval: number
    private retentionPeriod: number

    private constructor() {
        this.metrics = new Map()
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
        try {
            const key = this.getMetricKey(metric)
            if (!this.metrics.has(key)) {
                this.metrics.set(key, [])
            }

            const values = this.metrics.get(key)!
            values.push({
                value: metric.value,
                timestamp: Date.now(),
            })

            await this.updateAggregates(key, metric)

            this.logger.debug(`Collected metric: ${key}`)
        } catch (error) {
            this.logger.error("Failed to collect metric", error)
            throw error
        }
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
        // CPU, 메모리, 처리량 등 시스템 메트릭 수집
        const metrics = await this.getSystemMetrics()
        await this.collectBatch(metrics)
    }

    public async getSystemMetrics(): Promise<Metric[]> {
        // 시스템 메트릭 수집 로직
        return [
            {
                type: MetricType.GAUGE,
                module: "system",
                name: "memory_usage",
                value: process.memoryUsage().heapUsed,
                timestamp: Date.now(),
            },
            // 추가 시스템 메트릭
        ]
    }
}

export default MetricManager
