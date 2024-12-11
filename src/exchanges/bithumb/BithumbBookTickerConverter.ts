/**
 * Path: src/exchanges/bithumb/BithumbBookTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types";
import { BookTickerConverter, BookTickerData } from "../common/types";
import { BithumbOrderBookMessage, convertBithumbSymbol } from "./types";

export class BithumbBookTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: {
            type: string;
            code: string;
            total_ask_size: number;
            total_bid_size: number;
            orderbook_units: Array<{
                ask_price: number;
                bid_price: number;
                ask_size: number;
                bid_size: number;
            }>;
        }
    ): BookTickerData {
        const bestBid = rawData.orderbook_units[0]?.bid_price
            ? {
                  price: rawData.orderbook_units[0].bid_price,
                  quantity: rawData.orderbook_units[0].bid_size,
              }
            : { price: 0, quantity: 0 };

        const bestAsk = rawData.orderbook_units[0]?.ask_price
            ? {
                  price: rawData.orderbook_units[0].ask_price,
                  quantity: rawData.orderbook_units[0].ask_size,
              }
            : { price: 0, quantity: 0 };

        return {
            exchange: "bithumb",
            exchangeType: config.exchangeType,
            symbol: rawData.code,
            timestamp: Date.now(), // Bithumb의 메시지에 타임스탬프가 없는 경우 현재 시간 사용
            bids: [[bestBid.price, bestBid.quantity]],
            asks: [[bestAsk.price, bestAsk.quantity]],
        };
    }
}
