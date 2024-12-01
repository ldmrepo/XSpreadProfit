/**
 * src/types/market.ts
 * 시장 데이터 관련 타입 정의
 */

export interface StandardData {
    exchange: string;
    symbol: string;
    ticker: string;
    exchangeType: "spot" | "futures";
    timestamp: number; // Unix timestamp in milliseconds
    bids: [number, number][]; // [price, quantity][]
    asks: [number, number][]; // [price, quantity][]
}
