// src/components/Processor.ts
/**
 * Processor (등록기)
 *
 * 수집된 시장 데이터를 처리하고 저장하는 컴포넌트
 * - 데이터 검증 및 정규화
 * - 메모리 관리
 * - Redis 저장
 * - 배치 처리
 */

import { Redis } from "ioredis"
import { Logger } from "../utils/logger"
import EventManager from "../managers/EventManager"
import StateManager from "../managers/StateManager"
import MetricManager from "../managers/MetricManager"
import ErrorManager from "../managers/ErrorManager"
import {
    ProcessorConfig,
    ManagerDependencies,
    MemoryConfig,
    BatchConfig,
} from "../types/config"
import { MarketData, ProcessedData } from "../types/data"
import { MetricType } from "../types/metrics"

class Processor {
    private id: string
    private exchangeId: string
    private redis?: Redis
    private eventManager: EventManager
    private stateManager: StateManager
    private metricManager: MetricManager
    private errorManager: ErrorManager
    private logger: Logger

    // 메모리 관리
    private memoryPool: Map<string, Buffer>
    private processingQueue: ProcessedData[]
    private batchSize: number
    private batchTimeout: number
    private batchTimer: NodeJS.Timeout | null

    constructor(config: ProcessorConfig) {
        this.id = config.id
        this.exchangeId = config.exchangeId
        this.eventManager = config.managers.eventManager
        this.stateManager = config.managers.stateManager
        this.metricManager = config.managers.metricManager
        this.errorManager = config.managers.errorManager
        this.logger = Logger.getInstance(`Processor:${this.id}`)

        // 초기화
        this.memoryPool = new Map()
        this.processingQueue = []
        this.batchSize = config.batchConfig?.size || 100
        this.batchTimeout = config.batchConfig?.timeout || 1000
        this.batchTimer = null
    }

    async start(): Promise<void> {
        try {
            await this.stateManager.changeState(this.id, "STARTING")

            // Redis 연결 초기화
            await this.initializeRedis()

            // 이벤트 구독 설정
            this.setupEventSubscriptions()

            // 메모리 풀 초기화
            this.initializeMemoryPool()

            // 배치 처리 시작
            this.startBatchProcessing()

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

            // 진행 중인 처리 완료
            await this.flushQueue()

            // 리소스 정리
            this.cleanup()

            await this.stateManager.changeState(this.id, "STOPPED")
            this.logger.info(`Processor ${this.id} stopped successfully`)
        } catch (error: any) {
            await this.handleStopError(error)
            throw error
        }
    }

    private async initializeRedis(): Promise<void> {
        try {
            this.redis = new Redis({
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || "6379"),
                password: process.env.REDIS_PASSWORD,
            })

            await this.redis.ping()
            this.logger.info("Redis connection established")
        } catch (error) {
            this.logger.error("Failed to initialize Redis connection", error)
            throw error
        }
    }

    private setupEventSubscriptions(): void {
        this.eventManager.subscribe(
            "MARKET_DATA",
            async (event) => await this.handleMarketData(event.payload),
            { field: "exchangeId", operator: "eq", value: this.exchangeId }
        )
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
    private async handleMarketData(data: MarketData): Promise<void> {
        const startTime = Date.now()
        try {
            // 데이터 검증
            this.validateData(data)

            // 데이터 정규화
            const normalizedData = await this.normalizeData(data)

            // 큐에 추가
            this.addToProcessingQueue(normalizedData)

            // 메트릭 업데이트
            await this.updateProcessingMetrics(startTime)
        } catch (error) {
            await this.handleProcessingError(error, data)
        }
    }

    private validateData(data: MarketData): void {
        // 데이터 유효성 검사
        if (!data.symbol || !data.timestamp || !data.exchangeId) {
            throw new Error("Invalid market data format")
        }
    }

    private async normalizeData(data: MarketData): Promise<ProcessedData> {
        // 데이터 정규화 로직
        return {
            ...data,
            processedAt: Date.now(),
            processorId: this.id,
        }
    }

    private addToProcessingQueue(data: ProcessedData): void {
        this.processingQueue.push(data)

        if (this.processingQueue.length >= this.batchSize) {
            this.processBatch()
        }
    }

    private async processBatch(): Promise<void> {
        if (this.processingQueue.length === 0) return

        const batch = this.processingQueue.splice(0, this.batchSize)
        const pipeline = this.redis!.pipeline()

        for (const data of batch) {
            const key = this.getRedisKey(data)
            pipeline.set(key, JSON.stringify(data))
            pipeline.expire(key, 86400) // 24시간 유지
        }

        try {
            await pipeline.exec()
            await this.updateBatchMetrics(batch.length)
        } catch (error: any) {
            await this.handleBatchError(error, batch)
        }
    }

    private startBatchProcessing(): void {
        this.batchTimer = setInterval(
            () => this.processBatch(),
            this.batchTimeout
        )
    }

    private async flushQueue(): Promise<void> {
        if (this.batchTimer) {
            clearInterval(this.batchTimer)
        }
        await this.processBatch()
    }

    private getRedisKey(data: ProcessedData): string {
        return `market:${data.exchangeId}:${data.symbol}:${data.timestamp}`
    }

    private initializeMemoryPool(): void {
        // 고정 크기 메모리 풀 초기화
        const poolSize = 1000 // 설정 가능
        const bufferSize = 1024 // 1KB

        for (let i = 0; i < poolSize; i++) {
            this.memoryPool.set(`buffer_${i}`, Buffer.alloc(bufferSize))
        }
    }

    private async updateProcessingMetrics(startTime: number): Promise<void> {
        const processingTime = Date.now() - startTime
        await this.metricManager.collect({
            type: MetricType.HISTOGRAM, // PROCESSING -> HISTOGRAM
            module: this.id,
            name: "processing_time",
            value: processingTime,
            timestamp: Date.now(),
        })
    }

    private async updateBatchMetrics(batchSize: number): Promise<void> {
        await this.metricManager.collect({
            type: MetricType.COUNTER, // BATCH -> COUNTER
            module: this.id,
            name: "batch_size",
            value: batchSize,
            timestamp: Date.now(),
        })
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
            data: data,
            error: error,
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
            error: error,
        })
    }

    private cleanup(): void {
        // 리소스 정리
        this.memoryPool.clear()
        this.processingQueue = []
        if (this.batchTimer) {
            clearInterval(this.batchTimer)
        }
    }

    getMemoryStatus(): Record<string, number> {
        return {
            poolSize: this.memoryPool.size,
            queueSize: this.processingQueue.length,
            memoryUsage: process.memoryUsage().heapUsed,
        }
    }

    getProcessingStatus(): Record<string, any> {
        return {
            queueLength: this.processingQueue.length,
            batchSize: this.batchSize,
            batchTimeout: this.batchTimeout,
        }
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

        // 상태를 ERROR로 변경
        await this.stateManager.changeState(this.id, "ERROR")

        // 이벤트 발행
        await this.eventManager.publish({
            type: "SYSTEM.STARTUP_FAILED",
            payload: {
                componentId: this.id,
                error: error.message,
                timestamp: Date.now(),
            },
            timestamp: Date.now(),
            source: this.id,
        })

        this.logger.error(`Processor ${this.id} startup failed:`, error)
    }
}

export default Processor
