// src/managers/SystemManager.ts

/**
 * SystemManager
 *
 * 시장 데이터 수집 시스템의 핵심 관리자
 * - 코어 매니저 초기화 및 관리
 * - 컴포넌트 생성 및 생명주기 관리
 * - 시스템 상태 및 메트릭 관리
 */

import {
    SystemConfig,
    ManagerDependencies,
    ExchangeConfig,
} from "../types/config"
import EventManager from "./EventManager"
import StateManager from "./StateManager"
import MetricManager from "./MetricManager"
import ErrorManager from "./ErrorManager"
import Collector from "../components/Collector"
import Processor from "../components/Processor"
import { Logger } from "../utils/logger"

export class SystemManager {
    private static instance: SystemManager
    private logger: Logger

    // 코어 매니저
    private eventManager?: EventManager
    private stateManager?: StateManager
    private metricManager?: MetricManager
    private errorManager?: ErrorManager

    // 컴포넌트 관리
    private collectors: Map<string, Collector>
    private processors: Map<string, Processor>
    private config?: SystemConfig

    // 상태 관리
    private isInitialized: boolean = false
    private isRunning: boolean = false

    private constructor() {
        this.logger = Logger.getInstance("SystemManager")
        this.collectors = new Map()
        this.processors = new Map()
    }

    static getInstance(): SystemManager {
        if (!SystemManager.instance) {
            SystemManager.instance = new SystemManager()
        }
        return SystemManager.instance
    }

    async initialize(config: SystemConfig): Promise<void> {
        if (this.isInitialized) {
            throw new Error("SystemManager is already initialized")
        }

        try {
            this.config = config

            // 코어 매니저 초기화
            await this.initializeManagers()

            // 거래소별 컴포넌트 생성
            await this.createComponents()

            this.isInitialized = true
            this.logger.info("SystemManager initialized successfully")
        } catch (error) {
            this.logger.error("Failed to initialize SystemManager:", error)
            throw error
        }
    }

    async start(): Promise<void> {
        if (!this.isInitialized) {
            throw new Error("SystemManager is not initialized")
        }

        if (this.isRunning) {
            throw new Error("System is already running")
        }

        try {
            // 컴포넌트 순차 시작
            await this.startComponents()

            this.isRunning = true
            this.logger.info("System started successfully")
        } catch (error) {
            this.logger.error("Failed to start system:", error)
            await this.emergencyShutdown()
            throw error
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return
        }

        try {
            this.logger.info("Initiating system shutdown...")

            // 컴포넌트 순차 종료
            await this.stopComponents()

            this.isRunning = false
            this.logger.info("System stopped successfully")
        } catch (error) {
            this.logger.error("Error during system shutdown:", error)
            throw error
        }
    }

    private async initializeManagers(): Promise<void> {
        this.logger.info("Initializing core managers...")

        this.eventManager = EventManager.getInstance()
        this.stateManager = StateManager.getInstance()
        this.metricManager = MetricManager.getInstance()
        this.errorManager = ErrorManager.getInstance()

        await Promise.all([
            this.eventManager.initialize(this.config!.eventManager),
            this.stateManager.initialize(this.config!.stateManager),
            this.metricManager.initialize(this.config!.metricManager),
            this.errorManager.initialize(this.config!.errorManager),
        ])
    }

    private async createComponents(): Promise<void> {
        this.logger.info("Creating components for exchanges...")

        const managerDeps: ManagerDependencies = {
            eventManager: this.eventManager!,
            stateManager: this.stateManager!,
            metricManager: this.metricManager!,
            errorManager: this.errorManager!,
        }

        for (const exchange of this.config!.exchanges) {
            await this.createExchangeComponents(exchange, managerDeps)
        }
    }

    private async createExchangeComponents(
        exchange: ExchangeConfig,
        managers: ManagerDependencies
    ): Promise<void> {
        const collector = new Collector({
            id: `${exchange.id}_collector`,
            exchangeId: exchange.id,
            websocketUrl: exchange.websocketUrl,
            managers,
            wsConfig: this.config!.collector.wsConfig,
            bufferConfig: this.config!.collector.bufferConfig,
            retryPolicy: this.config!.collector.retryPolicy,
        })

        const processor = new Processor({
            id: `${exchange.id}_processor`,
            exchangeId: exchange.id,
            redisConfig: this.config!.redis,
            managers,
            batchConfig: this.config!.processor.batchConfig,
            memoryConfig: this.config!.processor.memoryConfig,
            memoryLimit: this.config!.processor.memoryLimit,
        })

        this.collectors.set(exchange.id, collector)
        this.processors.set(exchange.id, processor)
    }

    private async startComponents(): Promise<void> {
        // 등록기 먼저 시작
        for (const [exchangeId, processor] of this.processors) {
            try {
                await processor.start()
                this.logger.info(`Started processor for ${exchangeId}`)
            } catch (error) {
                this.logger.error(
                    `Failed to start processor for ${exchangeId}:`,
                    error
                )
                throw error
            }
        }

        // 수집기 시작
        for (const [exchangeId, collector] of this.collectors) {
            try {
                await collector.start()
                this.logger.info(`Started collector for ${exchangeId}`)
            } catch (error) {
                this.logger.error(
                    `Failed to start collector for ${exchangeId}:`,
                    error
                )
                throw error
            }
        }
    }

    private async stopComponents(): Promise<void> {
        // 수집기 먼저 종료
        for (const [exchangeId, collector] of this.collectors) {
            try {
                await collector.stop()
                this.logger.info(`Stopped collector for ${exchangeId}`)
            } catch (error) {
                this.logger.error(
                    `Error stopping collector for ${exchangeId}:`,
                    error
                )
            }
        }

        // 등록기 종료
        for (const [exchangeId, processor] of this.processors) {
            try {
                await processor.stop()
                this.logger.info(`Stopped processor for ${exchangeId}`)
            } catch (error) {
                this.logger.error(
                    `Error stopping processor for ${exchangeId}:`,
                    error
                )
            }
        }
    }

    private async emergencyShutdown(): Promise<void> {
        this.logger.warn("Initiating emergency shutdown...")

        try {
            await this.stopComponents()
        } catch (error) {
            this.logger.error("Error during emergency shutdown:", error)
        } finally {
            this.isRunning = false
        }
    }

    getSystemStatus(): Record<string, any> {
        const status: Record<string, any> = {
            initialized: this.isInitialized,
            running: this.isRunning,
            exchanges: {},
        }

        for (const [exchangeId, collector] of this.collectors) {
            status.exchanges[exchangeId] = {
                collector: collector.getStatus(),
                processor: this.processors
                    .get(exchangeId)
                    ?.getProcessingStatus(),
            }
        }

        return status
    }

    getMetrics(): Record<string, any> {
        return this.metricManager!.getSystemMetrics()
    }
}
