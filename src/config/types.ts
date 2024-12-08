/**
 * Path: src/config/types.ts
 * Configuration 타입 정의
 */

import { RedisConfig } from "../storage/redis/types";
// AppConfig 정의
export interface AppConfig {
    exchanges: ExchangeConfig[];
    redis: RedisConfig;
}

export interface ExchangeConfig {
    name: string;
    wsUrl: string;
    streamLimit: number;
    symbols: string[];
}
