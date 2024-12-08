/**
 * Path: src/main.ts
 */
import path from "path";
import dotenv from "dotenv";
import { ExchangeCollector } from "./collectors/ExchangeCollector";
import { WebSocketManager } from "./websocket/WebSocketManager";
import { WebSocketClient } from "./websocket/WebSocketClient";
import { ErrorHandler } from "./errors/ErrorHandler";
import { BinanceConnector } from "./exchanges/binance/BinanceConnector";
import { UpbitConnector } from "./exchanges/upbit/UpbitConnector";
import { RedisBookTickerStorage } from "./storage/redis/RedisClient";
import { BookTickerStorage } from "./exchanges/common/BookTickerStorage";
import { BookTickerData } from "./exchanges/common/types";
import { IExchangeConnector } from "./collectors/types";
import { AppConfig, ExchangeConfig } from "./config/types";
import { IConfigLoader } from "./config/IConfigLoader";
import { EnvConfigLoader } from "./config/EnvConfigLoader";
import { IBookTickerStorage } from "./storage/redis/types";

// src/main.ts
class Application {
    private collectors: Map<string, ExchangeCollector> = new Map();
    private readonly config: AppConfig;
    private isRunning: boolean = false;

    constructor(
        private readonly configLoader: IConfigLoader,
        private readonly errorHandler: ErrorHandler,
        private readonly bookTickerStorage: IBookTickerStorage
    ) {
        this.config = configLoader.loadConfig();
    }

    static create(envPath?: string): Application {
        const configLoader = new EnvConfigLoader(envPath);
        const config = configLoader.loadConfig();

        const errorHandler = new ErrorHandler(
            async () => {
                console.error("Fatal error occurred");
                process.exit(1);
            },
            (error: Error) => {
                console.error("Non-fatal error:", error);
            }
        );

        const redisStorage = new RedisBookTickerStorage(config.redis);
        BookTickerStorage.initialize(redisStorage);

        return new Application(configLoader, errorHandler, redisStorage);
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
        if (this.isRunning) {
            return;
        }

        console.log("Starting application...");

        try {
            for (const exchangeConfig of this.config.exchanges) {
                const collector =
                    this.createCollectorForExchange(exchangeConfig);
                this.collectors.set(exchangeConfig.name, collector);
                await collector.start();
                console.log(`Started collector for ${exchangeConfig.name}`);
            }

            this.startMetricsMonitoring();
            this.setupSignalHandlers();

            this.isRunning = true;
            console.log("Application started successfully");
        } catch (error) {
            console.error("Failed to start application:", error);
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
        if (!this.isRunning) {
            return;
        }

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

// index.ts
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
