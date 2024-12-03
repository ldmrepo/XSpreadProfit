/**
 * Processor (등록기)
 *
 * 수집된 시장 데이터를 처리하고 저장하는 컴포넌트
 * - SharedBuffer를 통한 메모리 관리
 * - Redis 저장
 * - 배치 처리
 */
import { Redis } from "ioredis"
import { Logger } from "../utils/logger"
import { SharedBuffer } from "../utils/SharedBuffer"

import { EventManagerInterface } from "../interfaces/EventManagerInterface"
import { StateManagerInterface } from "../interfaces/StateManagerInterface"
import { MetricManagerInterface } from "../interfaces/MetricManagerInterface"
import { ErrorManagerInterface } from "../interfaces/ErrorManagerInterface"

import { ProcessorConfig } from "../types/config"
import { MarketData, ProcessedData } from "../types/data"
import { MetricType } from "../types/metrics"
import fs from "fs/promises"

class Processor {
    private id: string
    private exchangeId: string
    private redis?: Redis
    private backupStoragePath: string
    private eventManager: EventManagerInterface
    private stateManager: StateManagerInterface
    private metricManager: MetricManagerInterface
    private errorManager: ErrorManagerInterface
    private logger: Logger

    private processingBuffer: SharedBuffer<ProcessedData>

    constructor(
        // json object로 변경
        config: ProcessorConfig,
        eventManager: EventManagerInterface,
        stateManager: StateManagerInterface,
        metricManager: MetricManagerInterface,
        errorManager: ErrorManagerInterface
    ) {
        this.id = config.id
        this.exchangeId = config.exchangeId
        this.backupStoragePath = `./backup_${this.id}.json`
        this.eventManager = eventManager
        this.stateManager = stateManager
        this.metricManager = metricManager
        this.errorManager = errorManager
        this.logger = Logger.getInstance(`Processor:${this.id}`)

        this.processingBuffer = new SharedBuffer<ProcessedData>(
            `${this.id}_buffer`,
            {
                maxSize: config.batchConfig?.maxSize || 1000,
                flushThreshold: 70,
                flushInterval: config.batchConfig?.flushInterval || 1000,
            },
            async (items) => this.processBatch(items)
        )
    }

    async start(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STARTING")
            await this.initializeRedis()
            this.monitorRedisConnection()
            this.setupEventSubscriptions()
            await this.stateManager.changeState(this.id, "RUNNING")
            this.logger.info(`Processor ${this.id} started successfully`)
        } catch (error: any) {
            await this.handleStartupError(error)
            throw error
        }
    }

    async stop(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STOPPING")
            await this.processingBuffer.flush()
            this.processingBuffer.dispose()
            await this.stateManager.changeState(this.id, "STOPPED")
            this.logger.info(`Processor ${this.id} stopped successfully`)
        } catch (error: any) {
            await this.handleStopError(error)
            throw error
        }
    }

    private async initializeRedis(): Promise<void> {
        const host = process.env.REDIS_HOST
        const port = parseInt(process.env.REDIS_PORT || "6379")
        const password = process.env.REDIS_PASSWORD

        if (!host || !port) {
            throw new Error("Missing required Redis configuration")
        }

        this.redis = new Redis({ host, port, password })

        try {
            await this.redis.ping()
            this.logger.info("Redis connection established")
        } catch (error) {
            this.logger.error("Failed to initialize Redis connection", error)
            throw error
        }
    }

    private monitorRedisConnection(): void {
        const interval = setInterval(async () => {
            try {
                if (!this.redis || this.redis.status !== "ready") {
                    this.logger.warn(
                        "Redis connection lost, attempting to reconnect..."
                    )
                    await this.initializeRedis()
                }
            } catch (error) {
                this.logger.error("Failed to reconnect Redis", error)
            }
        }, 5000)

        this.processingBuffer["addDisposeAction"](() => clearInterval(interval))
    }

    private setupEventSubscriptions(): void {
        this.eventManager.subscribe(
            "MARKET_DATA",
            async (event: any) => await this.handleMarketData(event.payload),
            { field: "exchangeId", operator: "eq", value: this.exchangeId }
        )
    }

    private async handleMarketData(data: MarketData): Promise<void> {
        const startTime = Date.now()
        try {
            this.validateData(data)
            const normalizedData = this.normalizeData(data)
            await this.processingBuffer.push(normalizedData)
            await this.updateProcessingMetrics(startTime)
        } catch (error) {
            await this.handleProcessingError(error, data)
        }
    }

    private validateData(data: MarketData): void {
        if (!data.symbol || !data.timestamp || !data.exchangeId) {
            throw new Error("Invalid market data format")
        }
    }

    private normalizeData(data: MarketData): ProcessedData {
        return {
            ...data,
            processedAt: Date.now(),
            processorId: this.id,
        }
    }

    private async processBatch(batch: ProcessedData[]): Promise<void> {
        if (batch.length === 0) return

        const pipeline = this.redis!.pipeline()
        for (const data of batch) {
            const key = this.getRedisKey(data)
            pipeline.set(key, JSON.stringify(data))
            pipeline.expire(key, 86400) // 24시간 유지
        }

        try {
            await pipeline.exec()
            await this.updateBatchMetrics(batch.length)
        } catch (error) {
            await this.handleBatchError(error, batch)
            await this.storeToBackup(batch) // 실패한 데이터를 대체 저장소에 저장
        }
    }

    private async storeToBackup(batch: ProcessedData[]): Promise<void> {
        try {
            const existingData = JSON.parse(
                (await fs.readFile(this.backupStoragePath, "utf8")) || "[]"
            )
            const combinedData = existingData.concat(batch)
            await fs.writeFile(
                this.backupStoragePath,
                JSON.stringify(combinedData)
            )
            this.logger.warn(
                `Data stored to backup storage: ${batch.length} items`
            )
        } catch (error) {
            this.logger.error("Failed to store data to backup storage", error)
        }
    }

    private getRedisKey(data: ProcessedData): string {
        return `market:${data.exchangeId}:${data.symbol}:${data.timestamp}`
    }

    private async recoverFromBackup(): Promise<void> {
        try {
            const data = JSON.parse(
                (await fs.readFile(this.backupStoragePath, "utf8")) || "[]"
            )
            for (const item of data) {
                await this.redis!.set(
                    this.getRedisKey(item),
                    JSON.stringify(item)
                )
            }
            await fs.unlink(this.backupStoragePath) // 복구 완료 후 삭제
            this.logger.info("Backup data successfully recovered")
        } catch (error) {
            this.logger.error("Failed to recover data from backup", error)
        }
    }

    private async updateProcessingMetrics(startTime: number): Promise<void> {
        const processingTime = Date.now() - startTime
        try {
            await this.metricManager.collect({
                type: MetricType.HISTOGRAM,
                module: this.id,
                name: "processing_time",
                value: processingTime,
                timestamp: Date.now(),
            })
        } catch (error) {
            this.logger.error("Failed to collect processing metrics", error)
        }
    }

    private async updateBatchMetrics(batchSize: number): Promise<void> {
        try {
            await this.metricManager.collect({
                type: MetricType.COUNTER,
                module: this.id,
                name: "batch_size",
                value: batchSize,
                timestamp: Date.now(),
            })
        } catch (error) {
            this.logger.error("Failed to collect batch metrics", error)
        }
    }

    private async handleProcessingError(
        error: any,
        data: MarketData
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Data processing failed",
            timestamp: Date.now(),
            data,
            error,
        })
    }

    private async handleBatchError(
        error: any,
        batch: ProcessedData[]
    ): Promise<void> {
        await this.errorManager.handleError({
            code: "STORAGE",
            type: "RECOVERABLE",
            module: this.id,
            message: "Batch processing failed",
            timestamp: Date.now(),
            data: { batchSize: batch.length },
            error,
        })
    }

    private async handleStartupError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "FATAL",
            module: this.id,
            message: "Failed to start processor",
            timestamp: Date.now(),
            error,
            retryable: false,
        })

        await this.stateManager.changeState(this.id, "ERROR")
    }

    private async handleStopError(error: Error): Promise<void> {
        await this.errorManager.handleError({
            code: "PROCESS",
            type: "RECOVERABLE",
            module: this.id,
            message: "Error during processor shutdown",
            timestamp: Date.now(),
            error,
            retryable: false,
        })
    }
}

export default Processor
