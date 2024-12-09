/**
 * Path: src/exchanges/bithumb/BithumbBookTickerConverter.ts
 */
import { BookTickerConverter, BookTickerData } from "../common/types"
import { BithumbOrderBookMessage, convertBithumbSymbol } from "./types"

export class BithumbBookTickerConverter extends BookTickerConverter {
    static convert(rawData: BithumbOrderBookMessage): BookTickerData {
        const bestBid = rawData.content.bids[0] || { price: "0", quantity: "0" }
        const bestAsk = rawData.content.asks[0] || { price: "0", quantity: "0" }

        return {
            symbol: convertBithumbSymbol.toStandardSymbol(
                rawData.content.symbol
            ),
            exchange: "bithumb",
            timestamp: rawData.content.timestamp,
            bids: [[parseFloat(bestBid.price), parseFloat(bestBid.quantity)]],
            asks: [[parseFloat(bestAsk.price), parseFloat(bestAsk.quantity)]],
        }
    }
}
