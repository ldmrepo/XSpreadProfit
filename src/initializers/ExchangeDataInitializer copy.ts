import { Redis } from "ioredis";
import { ExchangeInfo } from "../exchanges/common/types";
import { BinanceConnector } from "../exchanges/binance/BinanceConnector";
import { UpbitConnector } from "../exchanges/upbit/UpbitConnector";
import { BybitConnector } from "../exchanges/bybit/BybitConnector";
import { BithumbConnector } from "../exchanges/bithumb/BithumbConnector";

export class ExchangeDataInitializer {
    private readonly TTL = 24 * 60 * 60; // 24시간
    private readonly REDIS_KEYS = {
        STANDARDIZED: "standardized",
        MASTER: "master",
    };

    constructor(
        private readonly redis: Redis,
        private readonly logger: (msg: string) => void = console.log,
        private readonly domesticExchanges = ["upbit", "bithumb", "coinone"]
    ) {
        this.redis.on("error", (err) => {
            console.error("Redis connection error:", err);
        });
    }

    async initialize(exchanges: string[]): Promise<void> {
        this.logger("Initializing exchange data...");
        try {
            const exchangeDataMap = await this.fetchAndStoreExchangeData(
                exchanges
            );
            const globalData = await this.storeGlobalMasterData(
                exchangeDataMap
            );
            await this.storeExchangeMasterData(exchangeDataMap, globalData);
            this.logger("Exchange data initialization completed");
        } catch (error) {
            console.error("Exchange data initialization failed:", error);
            throw error;
        }
    }

    private async fetchAndStoreExchangeData(
        exchanges: string[]
    ): Promise<Map<string, ExchangeInfo[]>> {
        const exchangeDataMap = new Map<string, ExchangeInfo[]>();

        for (const exchange of exchanges) {
            this.logger(`Fetching ${exchange} exchange info...`);
            let exchangeInfo: ExchangeInfo[];

            switch (exchange) {
                case "binance":
                    exchangeInfo =
                        await BinanceConnector.fetchSpotExchangeInfo();
                    break;
                case "upbit":
                    exchangeInfo = await UpbitConnector.fetchSpotExchangeInfo();
                    break;
                case "bybit":
                    exchangeInfo = await BybitConnector.fetchSpotExchangeInfo();
                    break;
                case "bithumb":
                    exchangeInfo =
                        await BithumbConnector.fetchSpotExchangeInfo();
                    break;
                default:
                    throw new Error(`Unsupported exchange: ${exchange}`);
            }

            await this.storeStandardizedData(exchangeInfo);
            exchangeDataMap.set(exchange, exchangeInfo);
        }

        return exchangeDataMap;
    }

    private async storeStandardizedData(data: ExchangeInfo[]): Promise<void> {
        const pipeline = this.redis.pipeline();

        data.forEach((info) => {
            const key = `${this.REDIS_KEYS.STANDARDIZED}:${info.exchange}:${info.marketSymbol}`;
            pipeline.setex(key, this.TTL, JSON.stringify(info));
        });

        await pipeline.exec();
    }

    public processGlobalData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Map<string, ExchangeInfo> {
        const globalData = new Map<string, ExchangeInfo>();

        for (const [exchange, dataList] of exchangeDataMap.entries()) {
            if (!this.domesticExchanges.includes(exchange.toLowerCase())) {
                continue;
            }

            for (const data of dataList) {
                const baseSymbol = data.baseSymbol;

                if (!globalData.has(baseSymbol)) {
                    globalData.set(
                        baseSymbol,
                        this.createInitialGlobalData(data, exchange)
                    );
                    continue;
                }

                this.updateExistingGlobalData(
                    globalData.get(baseSymbol)!,
                    exchange
                );
            }
        }

        return globalData;
    }

    private createInitialGlobalData(
        data: ExchangeInfo,
        exchange: string
    ): ExchangeInfo {
        return {
            marketSymbol: data.marketSymbol,
            baseSymbol: data.baseSymbol,
            quoteSymbol: data.quoteSymbol,
            type: data.type,
            exchange: data.exchange,
            status: data.status,
            additionalInfo: {
                sourceExchanges: [exchange],
            },
        };
    }

    private updateExistingGlobalData(
        existingData: ExchangeInfo,
        exchange: string
    ): void {
        const sourceExchanges =
            (existingData.additionalInfo?.sourceExchanges as string[]) || [];
        sourceExchanges.push(exchange);

        existingData.additionalInfo = {
            ...existingData.additionalInfo,
            sourceExchanges,
        };
    }

    private async storeGlobalMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>
    ): Promise<Map<string, ExchangeInfo>> {
        const globalData = this.processGlobalData(exchangeDataMap);
        await this.saveGlobalDataToRedis(globalData);
        return globalData;
    }

    private async saveGlobalDataToRedis(
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        const pipeline = this.redis.pipeline();

        for (const [marketSymbol, data] of globalData.entries()) {
            const key = `${this.REDIS_KEYS.MASTER}:${marketSymbol}`;
            pipeline.setex(key, this.TTL, JSON.stringify(data));
        }

        await pipeline.exec();
    }

    private async storeExchangeMasterData(
        exchangeDataMap: Map<string, ExchangeInfo[]>,
        globalData: Map<string, ExchangeInfo>
    ): Promise<void> {
        const pipeline = this.redis.pipeline();

        for (const [exchange, dataList] of exchangeDataMap.entries()) {
            for (const data of dataList) {
                if (globalData.has(data.baseSymbol)) {
                    const key = `${this.REDIS_KEYS.MASTER}:${exchange}:${data.marketSymbol}`;
                    pipeline.setex(
                        key,
                        this.TTL,
                        JSON.stringify({
                            marketSymbol: data.marketSymbol,
                            baseSymbol: data.baseSymbol,
                            quoteSymbol: data.quoteSymbol,
                            type: data.type,
                            exchange: exchange,
                            status: data.status,
                        })
                    );
                }
            }
        }

        await pipeline.exec();
    }

    async cleanup(): Promise<void> {
        try {
            const patterns = [
                `${this.REDIS_KEYS.STANDARDIZED}:*`,
                `${this.REDIS_KEYS.MASTER}:*`,
            ];

            for (const pattern of patterns) {
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
        } catch (error) {
            console.error("Failed to cleanup Redis storage:", error);
            throw error;
        } finally {
            await this.redis.quit();
        }
    }
}
