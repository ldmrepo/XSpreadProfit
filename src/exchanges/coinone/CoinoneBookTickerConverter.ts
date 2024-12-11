/**
 * Path: src/exchanges/coinone/CoinoneTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types";
import { BookTickerConverter, BookTickerData } from "../common/types";
import { CoinoneTickerMessage, convertCoinoneMarketCode } from "./types";

export class CoinoneTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: CoinoneTickerMessage
    ): BookTickerData {
        const {
            data: {
                quote_currency,
                target_currency,
                timestamp,
                ask_best_price,
                ask_best_qty,
                bid_best_price,
                bid_best_qty,
            },
        } = rawData;

        const bestBid = {
            price: bid_best_price ? parseFloat(bid_best_price) : 0,
            quantity: bid_best_qty ? parseFloat(bid_best_qty) : 0,
        };

        const bestAsk = {
            price: ask_best_price ? parseFloat(ask_best_price) : 0,
            quantity: ask_best_qty ? parseFloat(ask_best_qty) : 0,
        };

        return {
            exchange: config.exchange,
            exchangeType: config.exchangeType,
            symbol: `${quote_currency}/${target_currency}`,
            timestamp,
            bids: [[bestBid.price, bestBid.quantity]],
            asks: [[bestAsk.price, bestAsk.quantity]],
        };
    }
}
