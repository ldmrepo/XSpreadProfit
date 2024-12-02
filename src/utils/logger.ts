// src/utils/logger.ts

import winston from "winston"
import DailyRotateFile from "winston-daily-rotate-file"

export class Logger {
    private logger: winston.Logger
    private static instances: Map<string, Logger> = new Map()

    private constructor(module: string) {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || "info",
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { module },
            transports: this.getTransports(),
        })
    }

    static getInstance(module: string): Logger {
        if (!Logger.instances.has(module)) {
            Logger.instances.set(module, new Logger(module))
        }
        return Logger.instances.get(module)!
    }

    private getTransports(): winston.transport[] {
        const transports: winston.transport[] = [
            // 콘솔 출력
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                ),
            }),

            // 일별 로그 파일
            new DailyRotateFile({
                filename: "logs/application-%DATE%.log",
                datePattern: "YYYY-MM-DD",
                zippedArchive: true,
                maxSize: "20m",
                maxFiles: "14d",
            }),

            // 에러 로그 파일
            new DailyRotateFile({
                filename: "logs/error-%DATE%.log",
                datePattern: "YYYY-MM-DD",
                zippedArchive: true,
                maxSize: "20m",
                maxFiles: "14d",
                level: "error",
            }),
        ]

        return transports
    }

    info(message: string, meta?: any): void {
        this.logger.info(message, meta)
    }

    error(message: string, error?: any): void {
        this.logger.error(message, {
            error: error?.message,
            stack: error?.stack,
        })
    }

    warn(message: string, meta?: any): void {
        this.logger.warn(message, meta)
    }

    debug(message: string, meta?: any): void {
        this.logger.debug(message, meta)
    }

    trace(message: string, meta?: any): void {
        this.logger.silly(message, meta)
    }

    // 성능 로깅
    logPerformance(operation: string, duration: number, meta?: any): void {
        this.logger.info("Performance", {
            operation,
            duration,
            ...meta,
        })
    }

    // 메트릭 로깅
    logMetric(metric: string, value: number, meta?: any): void {
        this.logger.info("Metric", {
            metric,
            value,
            ...meta,
        })
    }
}
