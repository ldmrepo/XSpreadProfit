/**
 * Path: src/exchanges/coinone/CoinoneBookTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types"
import { BookTickerConverter, BookTickerData } from "../common/types"
import { CoinoneOrderBookMessage, convertCoinoneMarketCode } from "./types"

export class CoinoneBookTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: CoinoneOrderBookMessage
    ): BookTickerData {
        const bestBid = rawData.orderbook.bids[0] || {
            price: "0",
            quantity: "0",
        }
        const bestAsk = rawData.orderbook.asks[0] || {
            price: "0",
            quantity: "0",
        }

        return {
            exchange: config.exchange,
            exchangeType: config.exchangeType,
            symbol: convertCoinoneMarketCode.toStandardSymbol(rawData.market),
            timestamp: rawData.timestamp,
            bids: [[parseFloat(bestBid.price), parseFloat(bestBid.quantity)]],
            asks: [[parseFloat(bestAsk.price), parseFloat(bestAsk.quantity)]],
        }
    }
}
