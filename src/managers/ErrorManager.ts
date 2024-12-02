// src/managers/ErrorManager.ts
/**
 * ErrorManager
 *
 * 시스템의 에러를 처리하고 복구 전략을 관리하는 매니저
 * - 에러 수집 및 분류
 * - 복구 전략 실행
 * - 에러 로깅 및 알림
 * - 에러 통계 관리
 */

import { Redis } from "ioredis"
import { Logger } from "../utils/logger"
import EventManager from "./EventManager"
import StateManager from "./StateManager"
import {
    SystemError,
    ErrorType,
    ErrorCode,
    ErrorPolicy,
    RecoveryStrategy,
    ErrorMetrics,
} from "../types/errors"
import { ErrorManagerConfig } from "../types/config"

class ErrorManager {
    private static instance: ErrorManager
    private errors: Map<string, SystemError[]>
    private policies: Map<ErrorType, ErrorPolicy>
    private recoveryStrategies: Map<ErrorCode, RecoveryStrategy>
    private metrics: ErrorMetrics
    private redis?: Redis
    private eventManager: EventManager
    private stateManager: StateManager
    private logger: Logger

    private constructor() {
        this.errors = new Map()
        this.policies = new Map()
        this.recoveryStrategies = new Map()
        this.metrics = {
            totalErrors: 0,
            recoveredErrors: 0,
            activeErrors: 0,
            errorsByType: new Map(),
        }
        this.eventManager = EventManager.getInstance()
        this.stateManager = StateManager.getInstance()
        this.logger = Logger.getInstance("ErrorManager")
    }

    static getInstance(): ErrorManager {
        if (!ErrorManager.instance) {
            ErrorManager.instance = new ErrorManager()
        }
        return ErrorManager.instance
    }

    async initialize(config: ErrorManagerConfig): Promise<void> {
        try {
            this.redis = new Redis(config.redisConfig)
            await this.initializeErrorPolicies()
            await this.initializeRecoveryStrategies()
            await this.setupErrorMonitoring()

            this.logger.info("ErrorManager initialized successfully")
        } catch (error) {
            this.logger.error("Failed to initialize ErrorManager", error)
            throw error
        }
    }
    private generateErrorId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    async handleError(error: Omit<SystemError, "id">): Promise<void> {
        const fullError: SystemError = {
            ...error,
            id: this.generateErrorId(), // 고유 ID 생성
            timestamp: Date.now(),
        }

        try {
            await this.logError(fullError)
            await this.updateMetrics(fullError)

            if (this.shouldAttemptRecovery(fullError)) {
                await this.recover(fullError)
            } else {
                await this.escalateError(fullError)
            }
        } catch (handlingError) {
            this.logger.error("Failed to handle error", handlingError)
            await this.escalateError(fullError)
        }
    }

    async recover(error: SystemError): Promise<void> {
        const strategy = this.recoveryStrategies.get(error.code)
        if (!strategy) {
            throw new Error(
                `No recovery strategy found for error code: ${error.code}`
            )
        }

        try {
            await strategy.execute(error)
            await this.markErrorAsRecovered(error)
            this.metrics.recoveredErrors++

            await this.notifyRecovery(error)
        } catch (recoveryError) {
            await this.handleRecoveryFailure(error, recoveryError)
        }
    }

    setPolicy(errorType: ErrorType, policy: ErrorPolicy): void {
        this.policies.set(errorType, policy)
    }

    getErrorMetrics(): ErrorMetrics {
        return { ...this.metrics }
    }

    shouldPropagate(error: SystemError): boolean {
        const policy = this.policies.get(error.type)
        return policy?.propagate || false
    }

    private async logError(error: SystemError): Promise<void> {
        // 에러 로깅
        const errorLog = {
            ...error,
            timestamp: Date.now(),
            stack: error.stack || error.error?.stack, // error 객체의 stack trace도 확인
        }

        await this.redis!.lpush(
            `errors:${error.module}`,
            JSON.stringify(errorLog)
        )

        // 최근 에러 목록 유지
        await this.redis!.ltrim(`errors:${error.module}`, 0, 999)

        this.logger.error(`Error in ${error.module}:`, {
            ...error,
            stack: errorLog.stack,
        })
    }

    private async updateMetrics(error: SystemError): Promise<void> {
        this.metrics.totalErrors++
        this.metrics.activeErrors++

        const typeCount = this.metrics.errorsByType.get(error.type) || 0
        this.metrics.errorsByType.set(error.type, typeCount + 1)

        await this.eventManager.publish({
            type: "SYSTEM.ERROR_METRICS",
            payload: this.metrics,
            timestamp: Date.now(),
            source: "ErrorManager",
        })
    }

    private shouldAttemptRecovery(error: SystemError): boolean {
        if (!error.retryable) return false

        const policy = this.policies.get(error.type)
        if (!policy) return false

        const errorCount = this.getErrorCount(error.module, error.code)
        return errorCount < policy.maxRetries
    }

    private async handleRecoveryFailure(
        originalError: SystemError,
        recoveryError: any
    ): Promise<void> {
        this.logger.error("Recovery failed:", recoveryError)

        // 복구 실패 시 상태 변경
        await this.stateManager.changeState(originalError.module, "ERROR")

        // 복구 실패 이벤트 발행
        await this.eventManager.publish({
            type: "SYSTEM.RECOVERY_FAILED",
            payload: {
                originalError,
                recoveryError,
            },
            timestamp: Date.now(),
            source: "ErrorManager",
        })

        await this.escalateError(originalError)
    }

    private async escalateError(error: SystemError): Promise<void> {
        // 심각도에 따른 알림 발송
        if (error.type === "FATAL") {
            await this.sendEmergencyNotification(error)
        }

        // 에러 이벤트 발행
        await this.eventManager.publish({
            type: "SYSTEM.ERROR_ESCALATED",
            payload: error,
            timestamp: Date.now(),
            source: "ErrorManager",
        })
    }

    private async markErrorAsRecovered(error: SystemError): Promise<void> {
        this.metrics.activeErrors--

        await this.redis!.hset(
            `recovered:${error.module}`,
            error.id,
            JSON.stringify({
                error,
                recoveredAt: Date.now(),
            })
        )
    }

    private async notifyRecovery(error: SystemError): Promise<void> {
        await this.eventManager.publish({
            type: "SYSTEM.ERROR_RECOVERED",
            payload: error,
            timestamp: Date.now(),
            source: "ErrorManager",
        })
    }

    private getErrorCount(module: string, code: ErrorCode): number {
        const moduleErrors = this.errors.get(module) || []
        return moduleErrors.filter((e) => e.code === code).length
    }

    private async initializeErrorPolicies(): Promise<void> {
        // 기본 에러 정책 설정
        const defaultPolicies: Map<ErrorType, ErrorPolicy> = new Map([
            ["FATAL", { maxRetries: 0, propagate: true, timeout: 0 }],
            ["RECOVERABLE", { maxRetries: 3, propagate: false, timeout: 5000 }],
            ["WARNING", { maxRetries: 5, propagate: false, timeout: 1000 }],
        ])

        this.policies = defaultPolicies
    }

    private async initializeRecoveryStrategies(): Promise<void> {
        // 기본 복구 전략 설정
        this.recoveryStrategies.set("NETWORK", {
            execute: async (error) => {
                // 네트워크 복구 로직
                await this.retryConnection(error)
            },
        })

        this.recoveryStrategies.set("PROCESS", {
            execute: async (error) => {
                // 프로세스 복구 로직
                await this.restartProcess(error)
            },
        })
    }

    private async setupErrorMonitoring(): Promise<void> {
        // 주기적인 에러 모니터링
        setInterval(() => {
            this.monitorErrors().catch((error) =>
                this.logger.error("Error monitoring failed:", error)
            )
        }, 10000)
    }

    private async monitorErrors(): Promise<void> {
        // 활성 에러 모니터링 및 정리
        const now = Date.now()
        for (const [module, errors] of this.errors.entries()) {
            const activeErrors = errors.filter((error) => {
                const policy = this.policies.get(error.type)
                return policy && now - error.timestamp < policy.timeout
            })

            if (activeErrors.length !== errors.length) {
                this.errors.set(module, activeErrors)
                this.metrics.activeErrors = this.calculateActiveErrors()
            }
        }
    }

    private calculateActiveErrors(): number {
        let total = 0
        for (const errors of this.errors.values()) {
            total += errors.length
        }
        return total
    }

    private async retryConnection(error: SystemError): Promise<void> {
        // 네트워크 연결 재시도 로직
    }

    private async restartProcess(error: SystemError): Promise<void> {
        // 프로세스 재시작 로직
    }

    private async sendEmergencyNotification(error: SystemError): Promise<void> {
        // 긴급 알림 발송 로직
    }
}

export default ErrorManager
