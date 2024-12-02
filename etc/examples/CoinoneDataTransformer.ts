// CoinoneDataTransformer.ts
import { ExchangeDataTransformer } from "./ExchangeDataTransformer";

export class CoinoneDataTransformer extends ExchangeDataTransformer {
    public static transformToStandardFormat(data: any): any {
        try {
            const standardData = {
                exchange: "Coinone", // Exchange name
                ticker: data?.ticker || "unknown", // Ticker symbol (e.g., BTC)
                symbol: data?.market || "unknown", // Market symbol (e.g., BTC/KRW)
                timestamp: data?.timestamp || Date.now(), // Transaction time or fallback to current time
                bids: (data?.bid || []).map((bid: [string, string]) => [
                    parseFloat(bid[0]),
                    parseFloat(bid[1]),
                ]),
                asks: (data?.ask || []).map((ask: [string, string]) => [
                    parseFloat(ask[0]),
                    parseFloat(ask[1]),
                ]),
            };
            return standardData;
        } catch (error) {
            console.error("Coinone Data Transformation Error:", error);
            throw new Error(
                "Failed to transform Coinone data to standard format."
            );
        }
    }
}
