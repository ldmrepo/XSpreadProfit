/**
 * Path: src/main.ts
 * Purpose: 애플리케이션 초기화 및 실행 관리
 */

import { ExchangeCollector } from "./collectors/ExchangeCollector";
import { WebSocketManager } from "./websocket/WebSocketManager";
import { WebSocketClient } from "./websocket/WebSocketClient";
import { ErrorHandler } from "./errors/ErrorHandler";
import { BinanceConnector } from "./exchanges/binance/BinanceConnector";
import { UpbitConnector } from "./exchanges/upbit/UpbitConnector";
import { BybitConnector } from "./exchanges/bybit/BybitConnector";
import { RedisBookTickerStorage } from "./storage/redis/RedisClient";
import { BookTickerStorage } from "./exchanges/common/BookTickerStorage";
import { IExchangeConnector } from "./collectors/types";
import { AppConfig, ExchangeConfig } from "./config/types";
import { IConfigLoader } from "./config/IConfigLoader";
import { EnvConfigLoader } from "./config/EnvConfigLoader";
import { IBookTickerStorage } from "./storage/redis/types";
import { ExchangeDataInitializer } from "./initializers/ExchangeDataInitializer";
import Redis from "ioredis";

class Application {
    private collectors: Map<string, ExchangeCollector> = new Map();
    private readonly config: AppConfig;
    private isRunning: boolean = false;

    constructor(
        private readonly configLoader: IConfigLoader,
        private readonly errorHandler: ErrorHandler,
        private readonly bookTickerStorage: IBookTickerStorage,
        private readonly exchangeInitializer: ExchangeDataInitializer
    ) {
        this.config = configLoader.loadConfig();
    }

    static create(envPath?: string): Application {
        const configLoader = new EnvConfigLoader(envPath);
        const config = configLoader.loadConfig();
        // Redis 클라이언트 초기화
        const redis = new Redis(config.redis);
        const errorHandler = new ErrorHandler(
            async () => {
                console.error("Fatal error occurred");
                process.exit(1);
            },
            (error: Error) => console.error("Non-fatal error:", error)
        );
        const redisStorage = new RedisBookTickerStorage(config.redis);
        BookTickerStorage.initialize(redisStorage);

        return new Application(
            configLoader,
            errorHandler,
            redisStorage,
            new ExchangeDataInitializer(redis)
        );
    }

    protected createWebSocketManager(
        exchangeConfig: ExchangeConfig
    ): WebSocketManager {
        return new WebSocketManager(
            new WebSocketClient(),
            {
                url: exchangeConfig.wsUrl,
                options: {
                    pingInterval: 30000,
                    pongTimeout: 5000,
                },
            },
            this.errorHandler
        );
    }

    protected createConnector(
        exchangeConfig: ExchangeConfig,
        id: string,
        symbols: string[]
    ): IExchangeConnector {
        switch (exchangeConfig.name) {
            case "binance":
                return new BinanceConnector(
                    id,
                    symbols,
                    this.createWebSocketManager(exchangeConfig)
                );
            case "upbit":
                return new UpbitConnector(
                    id,
                    symbols,
                    this.createWebSocketManager(exchangeConfig)
                );
            case "bybit":
                return new BybitConnector(
                    id,
                    symbols,
                    this.createWebSocketManager(exchangeConfig)
                );
            case "coinone":
                return new BybitConnector(
                    id,
                    symbols,
                    this.createWebSocketManager(exchangeConfig)
                );
            case "bithumb":
                return new BybitConnector(
                    id,
                    symbols,
                    this.createWebSocketManager(exchangeConfig)
                );
            default:
                throw new Error(`Unsupported exchange: ${exchangeConfig.name}`);
        }
    }

    protected createCollectorForExchange(
        exchangeConfig: ExchangeConfig
    ): ExchangeCollector {
        return new ExchangeCollector(
            (id: string, symbols: string[]) =>
                this.createConnector(exchangeConfig, id, symbols),
            exchangeConfig.symbols,
            { streamLimitPerConnection: exchangeConfig.streamLimit }
        );
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;

        try {
            const exchangeConfigs = await this.exchangeInitializer.initialize(
                this.config.exchanges.map((e) => e.name)
            );

            for (const config of exchangeConfigs) {
                const collector = this.createCollectorForExchange(config);
                this.collectors.set(config.name, collector);
                await collector.start();
                console.log(`Started collector for ${config.name}`);
            }

            this.startMetricsMonitoring();
            this.setupSignalHandlers();
            this.isRunning = true;
        } catch (error) {
            await this.shutdown();
            throw error;
        }
    }

    private startMetricsMonitoring(): void {
        setInterval(() => {
            this.collectors.forEach((collector, exchange) => {
                console.log(`${exchange} metrics:`, collector.getMetrics());
            });
        }, 60000);
    }

    private setupSignalHandlers(): void {
        process.on("SIGINT", async () => {
            console.log("Received SIGINT. Shutting down...");
            await this.shutdown();
            process.exit(0);
        });

        process.on("SIGTERM", async () => {
            console.log("Received SIGTERM. Shutting down...");
            await this.shutdown();
            process.exit(0);
        });
    }

    public async shutdown(): Promise<void> {
        if (!this.isRunning) return;

        console.log("Shutting down...");

        for (const [exchange, collector] of this.collectors) {
            try {
                await collector.stop();
                console.log(`Stopped collector for ${exchange}`);
            } catch (error) {
                console.error(
                    `Error stopping collector for ${exchange}:`,
                    error
                );
            }
        }

        try {
            await this.bookTickerStorage.cleanup();
            console.log("Storage connection closed");
        } catch (error) {
            console.error("Error closing storage connection:", error);
        }

        this.isRunning = false;
    }

    public getCollectors(): Map<string, ExchangeCollector> {
        return new Map(this.collectors);
    }

    public getStatus(): string {
        return this.isRunning ? "running" : "stopped";
    }
}

async function main() {
    const app = Application.create();
    try {
        await app.start();
    } catch (error) {
        console.error("Application failed to start:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { Application, IConfigLoader, IBookTickerStorage };
