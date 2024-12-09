/**
 * Path: src/exchanges/bybit/BybitBookTickerConverter.ts
 */
import { BookTickerConverter, BookTickerData } from "../common/types"
import { BybitOrderBookMessage, convertBybitSymbol } from "./types"

export class BybitBookTickerConverter extends BookTickerConverter {
    static convert(rawData: BybitOrderBookMessage): BookTickerData {
        const bestBid = rawData.data.b[0] || ["0", "0"]
        const bestAsk = rawData.data.a[0] || ["0", "0"]

        return {
            symbol: convertBybitSymbol.toStandardSymbol(rawData.data.s),
            exchange: "bybit",
            timestamp: rawData.ts,
            bids: [[parseFloat(bestBid[0]), parseFloat(bestBid[1])]],
            asks: [[parseFloat(bestAsk[0]), parseFloat(bestAsk[1])]],
        }
    }
}
