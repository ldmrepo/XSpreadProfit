/**
 * Path: src/exchanges/common/BookTickerStorage.ts
 */
import { RedisBookTickerStorage } from "../../storage/redis/RedisClient";
import { BookTickerData } from "./types";

export class BookTickerStorage {
    private static instance: BookTickerStorage;
    private storage: RedisBookTickerStorage;

    private constructor(redisStorage: RedisBookTickerStorage) {
        this.storage = redisStorage;
    }

    static initialize(redisStorage: RedisBookTickerStorage): void {
        if (!BookTickerStorage.instance) {
            BookTickerStorage.instance = new BookTickerStorage(redisStorage);
        }
    }

    static getInstance(): BookTickerStorage {
        if (!BookTickerStorage.instance) {
            throw new Error("BookTickerStorage not initialized");
        }
        return BookTickerStorage.instance;
    }

    async storeBookTicker(data: BookTickerData): Promise<void> {
        await this.storage.saveBookTicker(data);
    }

    async getBookTicker(
        exchange: string,
        symbol: string
    ): Promise<BookTickerData | null> {
        return await this.storage.getBookTicker(exchange, symbol);
    }

    async getLatestBookTickers(): Promise<BookTickerData[]> {
        return await this.storage.getLatestBookTickers();
    }
}
