/**
 * Path: src/exchanges/upbit/UpbitBookTickerConverter.ts
 */
import { BookTickerConverter, BookTickerData } from "../common/types";
import { UpbitOrderBookMessage, convertUpbitMarketCode } from "./types";

export class UpbitBookTickerConverter extends BookTickerConverter {
    static convert(rawData: UpbitOrderBookMessage): BookTickerData {
        const bestOrder = rawData.orderbook_units[0];

        return {
            symbol: convertUpbitMarketCode.toStandardSymbol(rawData.code),
            exchange: "upbit",
            timestamp: rawData.timestamp,
            bids: [[bestOrder.bid_price, bestOrder.bid_size]],
            asks: [[bestOrder.ask_price, bestOrder.ask_size]],
        };
    }
}
