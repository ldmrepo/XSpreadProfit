/**
 * Path: src/storage/redis/RedisClient.ts
 */
import Redis from "ioredis"
import { RedisConfig } from "./types"
import { BookTickerData } from "../../exchanges/common/types"

export class RedisBookTickerStorage {
    public readonly client: Redis
    private readonly EXPIRY_TIME = 60 * 60 // 1시간
    private readonly KEY_PREFIX = "bookTicker:"

    constructor(config: RedisConfig) {
        this.client = new Redis(config)
    }

    private getKey(
        exchange: string,
        exchangeType: string,
        symbol: string
    ): string {
        return `${this.KEY_PREFIX}${exchange}:${exchangeType}:${symbol}`
    }

    async saveBookTicker(data: BookTickerData): Promise<void> {
        try {
            const key = this.getKey(
                data.exchange,
                data.exchangeType,
                data.symbol
            )
            await this.client.setex(key, this.EXPIRY_TIME, JSON.stringify(data))
        } catch (error) {
            console.error("Failed to save book ticker:", error)
            throw error
        }
    }

    async getBookTicker(
        exchange: string,
        exchangeType: string,
        symbol: string
    ): Promise<BookTickerData | null> {
        try {
            const key = this.getKey(exchange, exchangeType, symbol)
            const data = await this.client.get(key)
            return data ? JSON.parse(data) : null
        } catch (error) {
            console.error("Failed to get book ticker:", error)
            throw error
        }
    }

    async getLatestBookTickers(): Promise<BookTickerData[]> {
        try {
            const keys = await this.client.keys(`${this.KEY_PREFIX}*`)
            if (keys.length === 0) return []

            const data = await this.client.mget(keys)
            return data
                .filter((item) => item !== null)
                .map((item) => JSON.parse(item!))
        } catch (error) {
            console.error("Failed to get latest book tickers:", error)
            throw error
        }
    }

    async cleanup(): Promise<void> {
        await this.client.quit()
    }
}
