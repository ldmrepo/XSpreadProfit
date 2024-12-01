// BybitFuturesDataTransformer.ts
import { ExchangeDataTransformer } from "./ExchangeDataTransformer";

export class BybitFuturesDataTransformer extends ExchangeDataTransformer {
    public static transformToStandardFormat(data: any): any {
        try {
            const standardData = {
                symbol: data.s || "unknown", // Symbol (e.g., BTCUSDT)
                timestamp: data.T || Date.now(), // Transaction time or fallback to current time
                bids: (data.b || []).map((bid: [string, string]) => [
                    parseFloat(bid[0]),
                    parseFloat(bid[1]),
                ]),
                asks: (data.a || []).map((ask: [string, string]) => [
                    parseFloat(ask[0]),
                    parseFloat(ask[1]),
                ]),
            };
            return standardData;
        } catch (error) {
            console.error("Bybit Futures Data Transformation Error:", error);
            throw new Error(
                "Failed to transform Bybit futures data to standard format."
            );
        }
    }
}
