/**
 * Path: src/config/EnvConfigLoader.ts
 * EnvConfigLoader 구현
 */
import dotenv from "dotenv";
import { AppConfig, ExchangeConfig } from "./types";
import { IConfigLoader } from "./IConfigLoader";
import { RedisConfig } from "../storage/redis/types";

export class EnvConfigLoader implements IConfigLoader {
    constructor(private readonly envPath?: string) {
        if (envPath) {
            dotenv.config({ path: envPath });
        } else {
            dotenv.config();
        }
    }

    loadConfig(): AppConfig {
        const exchanges: ExchangeConfig[] = [
            {
                exchange: "binance",
                exchangeType: "spot",
                url: "https://api.binance.com",
                wsUrl: "wss://stream.binance.com:9443/stream",
                streamLimit: 100,
                symbols: [],
                used: false,
            },
            {
                exchange: "binance",
                exchangeType: "future",
                url: "https://fapi.binance.com",
                wsUrl: "wss://fstream.binance.com/stream",
                streamLimit: 100,
                symbols: [],
                used: false,
            },
            {
                exchange: "bybit",
                exchangeType: "spot",
                url: "https://api.bybit.com",
                wsUrl: "wss://stream.bybit.com/v5/public/spot",
                streamLimit: 100,
                symbols: [],
                used: false,
            },
            {
                exchange: "bybit",
                exchangeType: "future",
                url: "https://api.bybit.com",
                wsUrl: "wss://stream.bybit.com/v5/public/linear",
                streamLimit: 100,
                pingInterval: 20000,
                symbols: [],
                used: false,
            },
            {
                exchange: "upbit",
                exchangeType: "spot",
                url: "https://api.upbit.com",
                wsUrl: "wss://api.upbit.com/websocket/v1",
                streamLimit: 100,
                symbols: [],
                used: false,
            },
            {
                // 빗썸 추가
                exchange: "bithumb",
                exchangeType: "spot",
                url: process.env.BITHUMB_URL || "https://api.bithumb.com",
                wsUrl:
                    process.env.BITHUMB_WS_URL ||
                    "wss://ws-api.bithumb.com/websocket/v1",
                streamLimit: 100,
                symbols: [],
                used: true,
            },
            {
                // 코인원 추가
                exchange: "coinone",
                exchangeType: "spot",
                url: "https://api.coinone.co.kr",
                wsUrl: "wss://stream.coinone.co.kr",
                streamLimit: 100,
                symbols: [],
                used: false,
                pingInterval: 25 * 60 * 1000, // 25분 (30분 제한보다 여유있게 설정)
                pongTimeout: 5000,
            },
        ];

        const redis: RedisConfig = {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || "0", 10),
        };

        return { exchanges, redis };
    }
}
