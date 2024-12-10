/**
 * Path: src/exchanges/upbit/UpbitBookTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types"
import { BookTickerConverter, BookTickerData } from "../common/types"
import { UpbitOrderBookMessage, convertUpbitMarketCode } from "./types"

export class UpbitBookTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: UpbitOrderBookMessage
    ): BookTickerData {
        const bestOrder = rawData.orderbook_units[0]

        return {
            exchange: config.exchange,
            exchangeType: config.exchangeType,
            symbol: convertUpbitMarketCode.toStandardSymbol(rawData.code),
            timestamp: rawData.timestamp,
            bids: [[bestOrder.bid_price, bestOrder.bid_size]],
            asks: [[bestOrder.ask_price, bestOrder.ask_size]],
        }
    }
}
