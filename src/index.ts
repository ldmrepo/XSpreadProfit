// src/index.ts

/**
 * Market Data Collection System Entry Point
 *
 * 실시간 시장 데이터 수집 시스템의 진입점
 * - 시스템 설정 로드 및 초기화
 * - 매니저 및 컴포넌트 시작
 * - 시스템 상태 모니터링
 * - 종료 처리
 */

import { SystemManager } from "./managers/SystemManager"
import { ConfigLoader } from "./utils/config"
import { Logger } from "./utils/logger"
import { SystemConfig } from "./types/config"
import MetricManager from "./managers/MetricManager"
import { SystemMetrics } from "metrics"

const logger = Logger.getInstance("System")

class Application {
    private systemManager: SystemManager
    private config?: SystemConfig
    private isShuttingDown: boolean = false

    constructor() {
        this.systemManager = SystemManager.getInstance()
    }

    async initialize(): Promise<void> {
        try {
            // 설정 로드
            logger.info("Loading system configuration...")
            this.config = await ConfigLoader.getInstance().loadConfig()

            // 시스템 매니저 초기화
            logger.info("Initializing system manager...")
            await this.systemManager.initialize(this.config!)

            // 시그널 핸들러 등록
            this.setupSignalHandlers()

            logger.info("System initialization completed")
        } catch (error) {
            logger.error("Failed to initialize system:", error)
            throw error
        }
    }

    async start(): Promise<void> {
        try {
            // 시스템 시작
            logger.info("Starting system...")
            await this.systemManager.start()

            // 모니터링 시작
            this.startMonitoring()

            logger.info("System started successfully")
        } catch (error) {
            logger.error("Failed to start system:", error)
            await this.shutdown(1)
        }
    }

    private setupSignalHandlers(): void {
        // SIGTERM 핸들러
        process.on("SIGTERM", async () => {
            logger.info("Received SIGTERM signal")
            await this.shutdown(0)
        })

        // SIGINT 핸들러 (Ctrl+C)
        process.on("SIGINT", async () => {
            logger.info("Received SIGINT signal")
            await this.shutdown(0)
        })

        // 처리되지 않은 예외 핸들러
        process.on("uncaughtException", async (error) => {
            logger.error("Uncaught exception:", error)
            await this.shutdown(1)
        })

        // 처리되지 않은 Promise 거부 핸들러
        process.on("unhandledRejection", async (reason) => {
            logger.error("Unhandled rejection:", reason)
            await this.shutdown(1)
        })
    }

    private startMonitoring(): void {
        const monitoringInterval = this.config!.metricManager.enabled
            ? this.config!.metricManager.flushInterval
            : 60000 // 기본값 1분

        setInterval(async () => {
            try {
                await this.checkSystemHealth()
            } catch (error) {
                logger.error("Error in system health check:", error)
            }
        }, monitoringInterval)
    }

    private async checkSystemHealth(): Promise<void> {
        const status = this.systemManager.getSystemStatus()
        const metrics = await MetricManager.getInstance().getSystemMetrics()

        if (!metrics) {
            logger.warn("No metrics available")
            return
        }

        // SystemMetrics 타입으로 명시적 타입 지정
        const systemMetrics: SystemMetrics = {
            totalProcessedEvents: metrics.totalProcessedEvents,
            errorRate: metrics.errorRate,
            memoryUsage: metrics.memoryUsage,
            uptime: metrics.uptime,
            componentMetrics: metrics.componentMetrics,
        }

        // 시스템 상태 로깅
        logger.info("System Health Check", {
            status,
            metrics: {
                processedEvents: systemMetrics.totalProcessedEvents,
                errorRate: systemMetrics.errorRate,
                memoryUsage: systemMetrics.memoryUsage,
                uptime: systemMetrics.uptime,
            },
        })

        // 임계값 체크 및 경고
        this.checkThresholds(systemMetrics)
    }

    private checkThresholds(metrics: SystemMetrics): void {
        // 메모리 사용량 체크
        if (metrics.memoryUsage > this.config!.processor.memoryLimit) {
            logger.warn("Memory usage exceeds limit", {
                current: metrics.memoryUsage,
                limit: this.config!.processor.memoryLimit,
            })
        }

        // 에러율 체크
        if (metrics.errorRate > 0.01) {
            logger.warn("High error rate detected", {
                errorRate: metrics.errorRate,
            })
        }

        // 처리 지연 체크 (componentMetrics에서 확인)
        const avgLatency =
            Object.values(metrics.componentMetrics).reduce(
                (sum, m) => sum + m.latency,
                0
            ) / Object.keys(metrics.componentMetrics).length

        if (avgLatency > 1000) {
            logger.warn("High processing latency detected", {
                latency: avgLatency,
            })
        }
    }

    async shutdown(code: number = 0): Promise<void> {
        if (this.isShuttingDown) {
            logger.info("Shutdown already in progress")
            return
        }

        this.isShuttingDown = true
        logger.info("Initiating system shutdown...")

        try {
            // 시스템 정상 종료
            await this.systemManager.stop()

            logger.info("System shutdown completed successfully")
            process.exit(code)
        } catch (error) {
            logger.error("Error during shutdown:", error)
            process.exit(1)
        }
    }
}

// 애플리케이션 시작
async function main() {
    const app = new Application()

    try {
        await app.initialize()
        await app.start()
    } catch (error) {
        logger.error("Fatal error:", error)
        process.exit(1)
    }
}

// 시작점
if (require.main === module) {
    main().catch((error) => {
        logger.error("Unrecoverable error:", error)
        process.exit(1)
    })
}
