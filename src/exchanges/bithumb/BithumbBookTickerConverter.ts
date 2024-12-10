/**
 * Path: src/exchanges/bithumb/BithumbBookTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types"
import { BookTickerConverter, BookTickerData } from "../common/types"
import { BithumbOrderBookMessage, convertBithumbSymbol } from "./types"

export class BithumbBookTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: BithumbOrderBookMessage
    ): BookTickerData {
        const bestBid = rawData.content.bids[0] || { price: "0", quantity: "0" }
        const bestAsk = rawData.content.asks[0] || { price: "0", quantity: "0" }

        return {
            exchange: "bithumb",
            exchangeType: config.exchangeType,
            symbol: convertBithumbSymbol.toStandardSymbol(
                rawData.content.symbol
            ),
            timestamp: rawData.content.timestamp,
            bids: [[parseFloat(bestBid.price), parseFloat(bestBid.quantity)]],
            asks: [[parseFloat(bestAsk.price), parseFloat(bestAsk.quantity)]],
        }
    }
}
