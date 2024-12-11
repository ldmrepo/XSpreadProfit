/**
 * Path: src/main.ts
 * Purpose: 애플리케이션 초기화 및 실행 관리
 */

import { ExchangeCollector } from "./collectors/ExchangeCollector"
import { WebSocketManager } from "./websocket/WebSocketManager"
import { WebSocketClient } from "./websocket/WebSocketClient"
import { ErrorHandler } from "./errors/ErrorHandler"
import { BinanceConnector } from "./exchanges/binance/BinanceConnector"
import { UpbitConnector } from "./exchanges/upbit/UpbitConnector"
import { BybitConnector } from "./exchanges/bybit/BybitConnector"
import { RedisBookTickerStorage } from "./storage/redis/RedisClient"
import { BookTickerStorage } from "./exchanges/common/BookTickerStorage"
import { IExchangeConnector } from "./collectors/types"
import { AppConfig, ExchangeConfig } from "./config/types"
import { IConfigLoader } from "./config/IConfigLoader"
import { EnvConfigLoader } from "./config/EnvConfigLoader"
import { IBookTickerStorage } from "./storage/redis/types"
import { ExchangeDataInitializer } from "./initializers/ExchangeDataInitializer"
import Redis from "ioredis"
import { ConnectorManager } from "./collectors/ConnectorManager"
import { WebSocketConfig } from "./websocket/types"

class Application {
    private collectors: Map<string, ConnectorManager> = new Map()
    private readonly config: AppConfig
    private isRunning: boolean = false
    private isShuttingDown: boolean = false // 종료 중인지 여부

    constructor(
        private readonly configLoader: IConfigLoader,
        private readonly errorHandler: ErrorHandler,
        private readonly bookTickerStorage: IBookTickerStorage,
        private readonly exchangeInitializer: ExchangeDataInitializer
    ) {
        this.config = configLoader.loadConfig()
    }

    static create(envPath?: string): Application {
        const configLoader = new EnvConfigLoader(envPath)
        const config = configLoader.loadConfig()
        // Redis 클라이언트 초기화
        const redis = new Redis(config.redis)
        const errorHandler = new ErrorHandler(
            async () => {
                console.error("Fatal error occurred")
                process.exit(1)
            },
            (error: Error) => console.error("Non-fatal error:", error)
        )
        const redisStorage = new RedisBookTickerStorage(config.redis)
        BookTickerStorage.initialize(redisStorage)

        return new Application(
            configLoader,
            errorHandler,
            redisStorage,
            new ExchangeDataInitializer(redis)
        )
    }

    protected createWebSocketManager(
        exchangeConfig: ExchangeConfig
    ): WebSocketManager {
        console.log(`Creating WebSocketManager for ${exchangeConfig.wsUrl}`)
        return new WebSocketManager(
            new WebSocketClient(),
            {
                url: exchangeConfig.wsUrl,
                reconnectOptions: {
                    maxAttempts: 100,
                    delay: 1000,
                    maxDelay: 5000,
                },
                options: {
                    pingInterval: 30000,
                    pongTimeout: 5000,
                },
            },
            this.errorHandler
        )
    }

    protected createConnector(
        exchangeConfig: ExchangeConfig,
        id: string,
        symbols: string[]
    ): IExchangeConnector {
        switch (exchangeConfig.exchange) {
            case "binance":
                if (exchangeConfig.exchangeType === "future") {
                    console.log(
                        `Creating connector for ${exchangeConfig.exchangeType} ${exchangeConfig.wsUrl}`
                    )
                    return new BinanceConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else if (exchangeConfig.exchangeType === "spot") {
                    return new BinanceConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else {
                    throw new Error(
                        `Unsupported exchange type: ${exchangeConfig.exchangeType}`
                    )
                }
            case "bybit":
                if (exchangeConfig.exchangeType === "future") {
                    return new BybitConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else if (exchangeConfig.exchangeType === "spot") {
                    return new BybitConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else {
                    throw new Error(
                        `Unsupported exchange type: ${exchangeConfig.exchangeType}`
                    )
                }
            case "upbit":
                if (exchangeConfig.exchangeType === "spot") {
                    return new UpbitConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else {
                    throw new Error(
                        `Unsupported exchange type: ${exchangeConfig.exchangeType}`
                    )
                }
            case "coinone":
                if (exchangeConfig.exchangeType === "spot") {
                    return new BybitConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else {
                    throw new Error(
                        `Unsupported exchange type: ${exchangeConfig.exchangeType}`
                    )
                }
            case "bithumb":
                if (exchangeConfig.exchangeType === "spot") {
                    return new BybitConnector(
                        id,
                        exchangeConfig,
                        symbols,
                        this.createWebSocketManager(exchangeConfig)
                    )
                } else {
                    throw new Error(
                        `Unsupported exchange type: ${exchangeConfig.exchangeType}`
                    )
                }
            default:
                throw new Error(
                    `Unsupported exchange: ${exchangeConfig.exchangeType}`
                )
        }
    }

    protected createCollectorForExchange(
        exchangeConfig: ExchangeConfig
    ): ConnectorManager {
        return new ConnectorManager(
            exchangeConfig,
            (id: string, symbols: string[], config: ExchangeConfig) =>
                this.createConnector(config, id, symbols)
        )
    }

    public async start(): Promise<void> {
        if (this.isRunning) return

        try {
            const exchangeConfigs = await this.exchangeInitializer.initialize(
                this.config.exchanges
            )

            for (const config of exchangeConfigs) {
                if (config.used) {
                    console.log("🚀 ~ Application ~ start ~ config:", config)
                    const collector = this.createCollectorForExchange(config)
                    this.collectors.set(
                        `${config.exchange}-${config.exchangeType}`,
                        collector
                    )
                    await collector.start(config.symbols) //.splice(0, 1))
                    console.log(
                        `Started collector for ${config.exchange} - ${config.exchangeType}`
                    )
                }
            }

            this.startMetricsMonitoring()
            this.setupSignalHandlers()
            this.isRunning = true
        } catch (error) {
            await this.shutdown()
            throw error
        }
    }

    private startMetricsMonitoring(): void {
        setInterval(() => {
            this.collectors.forEach((collector, exchange) => {
                console.log(`${exchange} metrics:`, collector.getMetrics())
            })
        }, 60000)
    }

    private setupSignalHandlers(): void {
        const shutdownHandler = async (signal: string) => {
            if (this.isShuttingDown) return // 중복 실행 방지
            this.isShuttingDown = true

            console.log(`Received ${signal}. Initiating graceful shutdown...`)
            await this.shutdown()

            console.log(
                `Application stopped gracefully after receiving ${signal}.`
            )
            process.exit(0)
        }

        process.on("SIGINT", () => shutdownHandler("SIGINT"))
        process.on("SIGTERM", () => shutdownHandler("SIGTERM"))
    }

    public async shutdown(): Promise<void> {
        if (!this.isRunning) return

        console.log("Shutting down... Cleaning up resources.")

        for (const [exchange, collector] of this.collectors) {
            try {
                await collector.stop()
                console.log(`Stopped collector for ${exchange}.`)
            } catch (error) {
                console.error(
                    `Error stopping collector for ${exchange}:`,
                    error
                )
            }
        }

        try {
            await this.bookTickerStorage.cleanup()
            console.log("Storage connection closed.")
        } catch (error) {
            console.error("Error closing storage connection:", error)
        }

        this.isRunning = false
        console.log("Shutdown process completed.")
    }

    public getCollectors(): Map<string, ConnectorManager> {
        return new Map(this.collectors)
    }

    public getStatus(): string {
        return this.isRunning ? "running" : "stopped"
    }
}

async function main() {
    // 애플리케이션 배너 출력
    console.log(`
        ====================================================================
           ██╗  ██╗███████╗██████╗ ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
           ██║  ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝
           ███████║█████╗  ██████╔╝██║  ██║██║  ██║██████╔╝██║  ██║█████╗  
           ██╔══██║██╔══╝  ██╔═══╝ ██║  ██║██║  ██║██╔═══╝ ██║  ██║██╔══╝  
           ██║  ██║███████╗██║     ██████╔╝██████╔╝██║     ██████╔╝███████╗
           ╚═╝  ╚═╝╚══════╝╚═╝     ╚═════╝ ╚═════╝ ╚═╝     ╚═════╝ ╚══════╝
        ====================================================================
        Welcome to xspreadprofit - Cryptocurrency Arbitrage System!
        Initializing the application. Please wait...
        ====================================================================
        `)

    const app = Application.create()
    try {
        await app.start()
    } catch (error) {
        console.error("Application failed to start:", error)
        process.exit(1)
    }
}

if (require.main === module) {
    main()
}

export { Application, IConfigLoader, IBookTickerStorage }
