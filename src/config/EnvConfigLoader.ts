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
                url: process.env.BINANCE_URL || "https://api.binance.com",
                wsUrl:
                    process.env.BINANCE_WS_URL ||
                    "wss://stream.binance.com:9443/ws",
                streamLimit: 300,
                symbols: [],
                used: true,
            },
            {
                // binance.futures 추가
                exchange: "binance",
                exchangeType: "future",
                url: process.env.BINANCE_URL || "https://fapi.binance.com",
                wsUrl:
                    process.env.BINANCE_WS_URL ||
                    "wss://fstream.binance.com/ws",
                streamLimit: 300,
                symbols: [],
                used: false,
            },
            {
                exchange: "bybit",
                exchangeType: "spot",
                url: process.env.BYBIT_URL || "https://api.bybit.com",
                wsUrl:
                    process.env.BYBIT_WS_URL ||
                    "wss://stream.bybit.com/v5/public/spot",
                streamLimit: parseInt(
                    process.env.BYBIT_STREAM_LIMIT || "200",
                    10
                ),
                symbols: [],
                used: false,
            },
            {
                exchange: "bybit",
                exchangeType: "future",
                url: process.env.BYBIT_URL || "https://api.bybit.com",
                wsUrl:
                    process.env.BYBIT_WS_URL ||
                    "wss://stream.bybit.com/realtime",
                streamLimit: parseInt(
                    process.env.BYBIT_STREAM_LIMIT || "200",
                    10
                ),
                symbols: [],
                used: false,
            },
            {
                exchange: "upbit",
                exchangeType: "spot",
                url: process.env.UPBIT_URL || "https://api.upbit.com",
                wsUrl:
                    process.env.UPBIT_WS_URL ||
                    "wss://api.upbit.com/websocket/v1",
                streamLimit: parseInt(
                    process.env.UPBIT_STREAM_LIMIT || "15",
                    10
                ),
                symbols: [],
                used: true,
            },
            {
                // 빗썸 추가
                exchange: "bithumb",
                exchangeType: "spot",
                url: process.env.BITHUMB_URL || "https://api.bithumb.com",
                wsUrl:
                    process.env.BITHUMB_WS_URL ||
                    "wss://pubwss.bithumb.com/pub/ws",
                streamLimit: parseInt(
                    process.env.BITHUMB_STREAM_LIMIT || "100",
                    10
                ),
                symbols: [],
                used: false,
            },
            {
                // 코인원 추가
                exchange: "coinone",
                exchangeType: "spot",
                url: process.env.COINONE_URL || "https://api.coinone.co.kr",
                wsUrl:
                    process.env.COINONE_WS_URL || "wss://push.coinone.co.kr/ws",
                streamLimit: parseInt(
                    process.env.COINONE_STREAM_LIMIT || "100",
                    10
                ),
                symbols: [],
                used: false,
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
