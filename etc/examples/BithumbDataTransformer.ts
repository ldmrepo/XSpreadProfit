// BithumbDataTransformer.ts
import { ExchangeDataTransformer } from "./ExchangeDataTransformer";

export class BithumbDataTransformer extends ExchangeDataTransformer {
    public static transformToStandardFormat(data: any): any {
        try {
            const standardData = {
                symbol: data?.symbol || "unknown", // Market symbol (e.g., BTC_KRW)
                timestamp: data?.timestamp || Date.now(), // Transaction time or fallback to current time
                bids: (data?.bids || []).map(
                    (bid: { price: string; quantity: string }) => [
                        parseFloat(bid.price),
                        parseFloat(bid.quantity),
                    ]
                ),
                asks: (data?.asks || []).map(
                    (ask: { price: string; quantity: string }) => [
                        parseFloat(ask.price),
                        parseFloat(ask.quantity),
                    ]
                ),
            };
            return standardData;
        } catch (error) {
            console.error("Bithumb Data Transformation Error:", error);
            throw new Error(
                "Failed to transform Bithumb data to standard format."
            );
        }
    }
}
