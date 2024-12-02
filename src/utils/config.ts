// src/utils/config.ts

import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"
import { SystemConfig, ExchangeConfig } from "../types/config"

// 환경변수 로드
dotenv.config()

export class ConfigLoader {
    private static instance: ConfigLoader
    private config: SystemConfig | null = null

    private constructor() {}

    static getInstance(): ConfigLoader {
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader()
        }
        return ConfigLoader.instance
    }

    async loadConfig(): Promise<SystemConfig> {
        if (this.config) return this.config

        try {
            const env = process.env.NODE_ENV || "development"
            const configPath = path.join(
                __dirname,
                "../../config",
                `${env}.json`
            )

            // 설정 파일 읽기
            const configFile = await fs.readFile(configPath, "utf8")
            const baseConfig = JSON.parse(configFile)

            // 환경 변수로 설정 오버라이드
            this.config = this.mergeWithEnv(baseConfig)

            // 설정 검증
            this.validateConfig(this.config)

            return this.config
        } catch (error: any) {
            throw new Error(`Failed to load config: ${error.message}`)
        }
    }

    private mergeWithEnv(baseConfig: SystemConfig): SystemConfig {
        return {
            ...baseConfig,
            redis: {
                host: process.env.REDIS_HOST || baseConfig.redis.host,
                port: parseInt(
                    process.env.REDIS_PORT || baseConfig.redis.port.toString()
                ),
                password:
                    process.env.REDIS_PASSWORD || baseConfig.redis.password,
            },
            exchanges: baseConfig.exchanges.map((exchange) =>
                this.mergeExchangeConfig(exchange)
            ),
        }
    }

    private mergeExchangeConfig(exchange: ExchangeConfig): ExchangeConfig {
        const envPrefix = exchange.id.toUpperCase()
        return {
            ...exchange,
            apiKey: process.env[`${envPrefix}_API_KEY`] || exchange.apiKey,
            apiSecret:
                process.env[`${envPrefix}_API_SECRET`] || exchange.apiSecret,
            websocketUrl:
                process.env[`${envPrefix}_WS_URL`] || exchange.websocketUrl,
        }
    }

    private validateConfig(config: SystemConfig): void {
        // 필수 필드 검증
        if (!config.name) throw new Error("Missing required config field: name")
        if (!config.version)
            throw new Error("Missing required config field: version")
        if (!config.redis)
            throw new Error("Missing required config field: redis")
        if (!config.exchanges)
            throw new Error("Missing required config field: exchanges")

        // Redis 설정 검증
        if (!config.redis.host || !config.redis.port) {
            throw new Error("Invalid Redis configuration")
        }

        // 거래소 설정 검증
        if (!Array.isArray(config.exchanges) || config.exchanges.length === 0) {
            throw new Error("No exchanges configured")
        }

        config.exchanges.forEach((exchange) => {
            if (!exchange.id || !exchange.websocketUrl) {
                throw new Error(
                    `Invalid exchange configuration for: ${exchange.id}`
                )
            }
        })
    }
}

export const getConfig = async (): Promise<SystemConfig> => {
    return await ConfigLoader.getInstance().loadConfig()
}
