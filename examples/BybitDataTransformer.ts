// BybitDataTransformer.ts
import { ExchangeDataTransformer } from "./ExchangeDataTransformer";

export class BybitDataTransformer extends ExchangeDataTransformer {
    public static transformToStandardFormat(data: any): any {
        try {
            const standardData = {
                symbol: data?.s || "unknown", // Symbol (e.g., BTC/USDT)
                timestamp: data?.ts || Date.now(), // Timestamp or fallback to current time
                bids: (data?.bids || []).map((bid: [string, string]) => [
                    parseFloat(bid[0]),
                    parseFloat(bid[1]),
                ]),
                asks: (data?.asks || []).map((ask: [string, string]) => [
                    parseFloat(ask[0]),
                    parseFloat(ask[1]),
                ]),
            };
            return standardData;
        } catch (error) {
            console.error("Bybit Data Transformation Error:", error);
            throw new Error(
                "Failed to transform Bybit data to standard format."
            );
        }
    }
}
