/**
 * src/modules/register/register.ts
 *
 * Market Data Register Module
 * 실시간 시장 데이터를 Redis에 저장하는 등록기 모듈
 *
 * Features:
 * - 배치 처리를 통한 고성능 데이터 처리
 * - Redis 연결 상태 관리 및 자동 복구
 * - 메모리 사용량 최적화 및 모니터링
 * - 상태 및 메트릭 관리
 */

import Redis from "ioredis";
import { EventEmitter } from "events";
import { StandardData } from "../types/market";

// Type definitions
interface StateChangeEvent {
    previousState: RegisterState;
    newState: RegisterState;
    timestamp: number;
}
interface RegisterConfig {
    redisUrl: string;
    auth?: string;
    batchSize: number;
    batchInterval: number;
    maxRetries?: number;
    maxBufferSize?: number;
    maxDataAge?: number;
    healthCheckInterval?: number;
    enableHealthCheck?: boolean; // 추가: healthCheck 활성화 옵션
}

interface RegisterMetrics {
    processedCount: number;
    errorCount: number;
    avgProcessingTime: number;
    lastProcessingTime: number;
    bufferSize: number;
    retryCount: number;
    memoryUsage: number;
    redisLatency: number;
}

enum RegisterState {
    INIT = "INIT",
    RUNNING = "RUNNING",
    ERROR = "ERROR",
    SHUTDOWN = "SHUTDOWN",
    REDIS_DISCONNECTED = "REDIS_DISCONNECTED",
}

export class Register extends EventEmitter {
    private redisClient: Redis;
    private buffer: StandardData[] = [];
    private batchSize: number;
    private batchInterval: number;
    private batchTimer: NodeJS.Timeout | null = null;
    private state: RegisterState = RegisterState.INIT;
    private maxRetries: number;
    private maxBufferSize: number;
    private maxDataAge: number;
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private metrics: RegisterMetrics;
    private lastHealthCheck: number = Date.now();

    constructor(config: RegisterConfig) {
        super();
        this.redisClient = new Redis(config.redisUrl, {
            password: config.auth,
            maxRetriesPerRequest: config.maxRetries || 3,
            retryStrategy: (times: number) => {
                return Math.min(times * 50, 2000);
            },
            enableReadyCheck: true,
        });

        this.batchSize = config.batchSize;
        this.batchInterval = config.batchInterval;
        this.maxRetries = config.maxRetries || 3;
        this.maxBufferSize = config.maxBufferSize || config.batchSize * 10;
        this.maxDataAge = config.maxDataAge || 30000;

        this.metrics = {
            processedCount: 0,
            errorCount: 0,
            avgProcessingTime: 0,
            lastProcessingTime: 0,
            bufferSize: 0,
            retryCount: 0,
            memoryUsage: 0,
            redisLatency: 0,
        };

        this.initializeRedisHandlers();

        // healthCheck는 옵션에 따라 활성화
        if (config.enableHealthCheck !== false) {
            this.startHealthCheck(config.healthCheckInterval || 5000);
        }

        this.setState(RegisterState.RUNNING);
    }

    private initializeRedisHandlers(): void {
        this.redisClient.on("error", (error: Error) => {
            this.setState(RegisterState.REDIS_DISCONNECTED);
            this.handleError(error);
        });

        this.redisClient.on("ready", () => {
            if (this.state === RegisterState.REDIS_DISCONNECTED) {
                this.setState(RegisterState.RUNNING);
                this.emit("redisReconnected", {
                    timestamp: Date.now(),
                });
            }
        });
    }

    private setState(newState: RegisterState): void {
        const prevState = this.state;
        this.state = newState;

        const stateChangeEvent: StateChangeEvent = {
            previousState: prevState,
            newState: this.state,
            timestamp: Date.now(),
        };

        this.emit("stateChange", stateChangeEvent);

        if (newState === RegisterState.ERROR) {
            this.handleErrorState();
        } else if (newState === RegisterState.REDIS_DISCONNECTED) {
            this.handleDisconnectedState();
        }
    }

    private handleErrorState(): void {
        if (this.metrics.errorCount >= this.maxRetries) {
            this.emit("criticalError", {
                errorCount: this.metrics.errorCount,
                timestamp: Date.now(),
            });
        }
    }

    private handleDisconnectedState(): void {
        this.emit("redisDisconnected", {
            lastHealthCheck: this.lastHealthCheck,
            timestamp: Date.now(),
        });
    }

    private async startHealthCheck(interval: number): Promise<void> {
        const performHealthCheck = async () => {
            try {
                const startTime = Date.now();
                const isConnected = await this.checkRedisConnection();
                this.metrics.redisLatency = Date.now() - startTime;

                if (
                    !isConnected &&
                    this.state !== RegisterState.REDIS_DISCONNECTED
                ) {
                    this.setState(RegisterState.REDIS_DISCONNECTED);
                }

                this.cleanupStaleData();
                this.updateMemoryMetrics();
                this.lastHealthCheck = Date.now();
            } catch (error) {
                this.handleError(error as Error);
            }
        };

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(performHealthCheck, interval);
        // 초기 헬스체크 수행
        await performHealthCheck();
    }

    private async checkRedisConnection(): Promise<boolean> {
        try {
            const result = await this.redisClient.ping();
            return result === "PONG";
        } catch {
            return false;
        }
    }

    private cleanupStaleData(): void {
        const now = Date.now();
        const originalLength = this.buffer.length;

        this.buffer = this.buffer.filter(
            (data) => now - (data.timestamp || 0) < this.maxDataAge
        );

        const removedCount = originalLength - this.buffer.length;
        if (removedCount > 0) {
            this.emit("dataCleanup", {
                removedCount,
                reason: "stale",
                timestamp: now,
            });
        }

        this.metrics.bufferSize = this.buffer.length;
    }

    private updateMemoryMetrics(): void {
        const memoryUsage = process.memoryUsage();
        this.metrics.memoryUsage = memoryUsage.heapUsed;

        if (memoryUsage.heapUsed > 0.8 * memoryUsage.heapTotal) {
            this.emit("highMemoryUsage", {
                used: memoryUsage.heapUsed,
                total: memoryUsage.heapTotal,
                timestamp: Date.now(),
            });
        }
    }

    private async flushBuffer(): Promise<void> {
        if (this.buffer.length === 0) return;

        const startTime = Date.now();
        const batch = this.buffer.splice(0, this.batchSize);

        try {
            const transaction = this.redisClient.multi();

            batch.forEach((data) => {
                transaction.rpush(
                    "market_data",
                    JSON.stringify({
                        ...data,
                        storedAt: Date.now(),
                    })
                );
            });

            const result = await this.executeWithRetry(() =>
                transaction.exec()
            );

            const successCount =
                result?.filter(([error]) => error === null).length ?? 0;
            const processingTime = Date.now() - startTime;

            this.updateMetrics(successCount, processingTime);

            this.emit("batchProcessed", {
                count: successCount,
                processingTime,
                batchSize: batch.length,
                timestamp: Date.now(),
            });

            this.adjustBatchSize(true);
        } catch (error) {
            this.handleError(error as Error);
            this.buffer.unshift(...batch);
            this.adjustBatchSize(false);
        }
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount >= this.maxRetries) {
                throw error;
            }

            this.metrics.retryCount++;
            await new Promise((resolve) =>
                setTimeout(resolve, Math.min(retryCount * 100, 1000))
            );
            return this.executeWithRetry(operation, retryCount + 1);
        }
    }

    private handleError(error: Error): void {
        this.metrics.errorCount++;
        this.setState(RegisterState.ERROR);

        this.emit("error", {
            error: error.message,
            timestamp: Date.now(),
            metrics: this.getMetrics(),
        });

        if (this.state !== RegisterState.SHUTDOWN) {
            this.setState(RegisterState.RUNNING);
        }
    }

    private adjustBatchSize(success: boolean): void {
        if (success && this.metrics.avgProcessingTime < 50) {
            this.batchSize = Math.min(this.batchSize * 1.2, this.maxBufferSize);
        } else if (!success) {
            this.batchSize = Math.max(this.batchSize * 0.8, 10);
        }
    }

    private updateMetrics(
        processedCount: number,
        processingTime: number
    ): void {
        this.metrics.processedCount += processedCount;
        this.metrics.lastProcessingTime = processingTime;
        this.metrics.avgProcessingTime =
            (this.metrics.avgProcessingTime *
                (this.metrics.processedCount - processedCount) +
                processingTime * processedCount) /
            this.metrics.processedCount;
        this.metrics.bufferSize = this.buffer.length;
    }

    public process(data: StandardData): void {
        try {
            if (this.state === RegisterState.SHUTDOWN) {
                throw new Error("Register is shutdown");
            }

            this.validateData(data);

            // 데이터 추가 전에 버퍼 크기 체크
            if (this.buffer.length >= this.maxBufferSize) {
                this.emit("bufferFull", {
                    currentSize: this.buffer.length,
                    maxSize: this.maxBufferSize,
                    timestamp: Date.now(),
                    droppedData: data, // 추가: 버려진 데이터 정보 포함
                });
                return; // 버퍼가 가득 찬 경우 데이터 추가하지 않음
            }

            this.buffer.push(data);
            this.metrics.bufferSize = this.buffer.length;

            // 배치 처리 조건 체크
            if (this.buffer.length >= this.batchSize) {
                void this.flushBuffer();
            } else if (!this.batchTimer) {
                this.startBatchTimer();
            }
        } catch (error) {
            this.handleError(error as Error);
        }
    }

    private validateData(data: StandardData): void {
        if (
            !data.bids ||
            !data.asks ||
            !Array.isArray(data.bids) ||
            !Array.isArray(data.asks)
        ) {
            throw new Error("Invalid data format");
        }

        if (!data.timestamp) {
            throw new Error("Missing timestamp");
        }

        // Additional validation can be added here
    }

    private startBatchTimer(): void {
        if (this.batchTimer) return;

        this.batchTimer = setTimeout(async () => {
            await this.flushBuffer();
            this.batchTimer = null;
        }, this.batchInterval);
    }

    public getState(): RegisterState {
        return this.state;
    }

    public getMetrics(): RegisterMetrics {
        return { ...this.metrics };
    }

    public async shutdown(): Promise<void> {
        this.setState(RegisterState.SHUTDOWN);

        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        if (this.buffer.length > 0) {
            await this.flushBuffer();
        }

        await this.redisClient.quit();
    }
}
