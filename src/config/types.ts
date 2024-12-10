/**
 * Path: src/config/types.ts
 * Configuration 타입 정의
 */

import { RedisConfig } from "../storage/redis/types"
// AppConfig 정의
export interface AppConfig {
    exchanges: ExchangeConfig[]
    redis: RedisConfig
}

export interface ExchangeConfig {
    exchange: string // binance, bybit
    exchangeType: string // spot, future
    url: string // exchange api url
    wsUrl: string // exchange websocket url
    streamLimit: number
    symbols: string[]
    used?: boolean // 사용 여부
}
