/**
 * Path: src/storage/types.ts
 * BookTickerStorage 타입 정의
 */
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
}

import { BookTickerData } from "../../exchanges/common/types";

export interface IBookTickerStorage {
    saveBookTicker(data: BookTickerData): Promise<void>;
    getBookTicker(
        exchange: string,
        symbol: string
    ): Promise<BookTickerData | null>;
    getLatestBookTickers(): Promise<BookTickerData[]>;
    cleanup(): Promise<void>;
}
