/**
 * Path: src/exchanges/coinone/CoinoneBookTickerConverter.ts
 */
import { BookTickerConverter, BookTickerData } from "../common/types"
import { CoinoneOrderBookMessage, convertCoinoneMarketCode } from "./types"

export class CoinoneBookTickerConverter extends BookTickerConverter {
    static convert(rawData: CoinoneOrderBookMessage): BookTickerData {
        const bestBid = rawData.orderbook.bids[0] || {
            price: "0",
            quantity: "0",
        }
        const bestAsk = rawData.orderbook.asks[0] || {
            price: "0",
            quantity: "0",
        }

        return {
            symbol: convertCoinoneMarketCode.toStandardSymbol(rawData.market),
            exchange: "coinone",
            timestamp: rawData.timestamp,
            bids: [[parseFloat(bestBid.price), parseFloat(bestBid.quantity)]],
            asks: [[parseFloat(bestAsk.price), parseFloat(bestAsk.quantity)]],
        }
    }
}
