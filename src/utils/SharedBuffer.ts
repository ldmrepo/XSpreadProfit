// src/utils/SharedBuffer.ts
/**
 * 공통 버퍼 관리 클래스
 * - 순환 버퍼 구현
 * - 자동 플러시 관리
 * - 메트릭 수집
 * - 이벤트 발생
 */

import { Logger } from "./logger"
import { BufferConfig, BufferMetrics, BufferEventType } from "../types/buffer"
import EventManager from "../managers/EventManager"
import MetricManager from "../managers/MetricManager"
import { MetricType } from "../types/metrics"

export class SharedBuffer<T> {
    private buffer: T[]
    private head: number = 0
    private tail: number = 0
    private count: number = 0
    private metrics: BufferMetrics
    private flushTimer: NodeJS.Timeout | null = null

    private readonly logger: Logger
    private readonly eventManager: EventManager
    private readonly metricManager: MetricManager

    constructor(
        private readonly id: string,
        private readonly config: BufferConfig,
        private readonly onFlush: (items: T[]) => Promise<void>
    ) {
        this.buffer = new Array<T>(config.maxSize)
        this.logger = Logger.getInstance(`SharedBuffer:${id}`)
        this.eventManager = EventManager.getInstance()
        this.metricManager = MetricManager.getInstance()

        this.metrics = {
            size: 0,
            totalItems: 0,
            droppedItems: 0,
            flushCount: 0,
            lastFlushTime: 0,
            utilizationRate: 0,
        }

        this.startFlushTimer()
    }

    async push(item: T): Promise<boolean> {
        try {
            if (this.count === this.config.maxSize) {
                await this.handleBufferFull(item)
                return false
            }

            this.buffer[this.tail] = item
            this.tail = (this.tail + 1) % this.config.maxSize
            this.count++
            this.metrics.totalItems++
            this.updateMetrics()

            if (this.shouldFlush()) {
                await this.flush()
            }

            return true
        } catch (error) {
            this.logger.error("Error pushing item to buffer", error)
            await this.emitBufferEvent("ERROR", { error })
            return false
        }
    }

    async flush(): Promise<void> {
        if (this.count === 0) return

        try {
            const items = this.collectItems()
            await this.onFlush(items)

            this.metrics.flushCount++
            this.metrics.lastFlushTime = Date.now()
            this.updateMetrics()

            await this.emitBufferEvent("FLUSHED", { count: items.length })
        } catch (error) {
            this.logger.error("Error flushing buffer", error)
            await this.emitBufferEvent("ERROR", { error })
        }
    }

    getMetrics(): BufferMetrics {
        return { ...this.metrics }
    }

    private async handleBufferFull(item: T): Promise<void> {
        this.metrics.droppedItems++
        await this.emitBufferEvent("FULL", { droppedItem: item })
        await this.flush()
    }

    private collectItems(): T[] {
        const items: T[] = []
        while (this.count > 0) {
            items.push(this.buffer[this.head])
            this.head = (this.head + 1) % this.config.maxSize
            this.count--
        }
        return items
    }

    private shouldFlush(): boolean {
        const utilizationRate = (this.count / this.config.maxSize) * 100
        return utilizationRate >= this.config.flushThreshold
    }

    private startFlushTimer(): void {
        if (this.config.flushInterval > 0) {
            this.flushTimer = setInterval(
                () => this.flush(),
                this.config.flushInterval
            )
        }
    }

    private updateMetrics(): void {
        this.metrics.size = this.count
        this.metrics.utilizationRate = (this.count / this.config.maxSize) * 100

        this.metricManager.collect({
            type: MetricType.GAUGE,
            module: this.id,
            name: "buffer_utilization",
            value: this.metrics.utilizationRate,
            timestamp: Date.now(),
            tags: {
                size: String(this.metrics.size),
                dropped: String(this.metrics.droppedItems),
            },
        })
    }

    private async emitBufferEvent(
        type: BufferEventType,
        payload: any
    ): Promise<void> {
        await this.eventManager.publish({
            type: `BUFFER.${type}`,
            payload: {
                bufferId: this.id,
                metrics: this.getMetrics(),
                ...payload,
            },
            timestamp: Date.now(),
            source: this.id,
        })
    }

    dispose(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
        }
    }
}
