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
                name: "binance",
                wsUrl:
                    process.env.BINANCE_WS_URL ||
                    "wss://stream.binance.com:9443/ws",
                streamLimit: parseInt(
                    process.env.BINANCE_STREAM_LIMIT || "1024",
                    10
                ),
                symbols: JSON.parse(process.env.BINANCE_SYMBOLS || "[]"),
            },
            {
                name: "upbit",
                wsUrl:
                    process.env.UPBIT_WS_URL ||
                    "wss://api.upbit.com/websocket/v1",
                streamLimit: parseInt(
                    process.env.UPBIT_STREAM_LIMIT || "15",
                    10
                ),
                symbols: JSON.parse(process.env.UPBIT_SYMBOLS || "[]"),
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
