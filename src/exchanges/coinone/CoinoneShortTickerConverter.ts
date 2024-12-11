/**
 * Path: src/exchanges/coinone/CoinoneShortTickerConverter.ts
 */
import { ExchangeConfig } from "../../config/types";
import { BookTickerConverter, BookTickerData } from "../common/types";
import { CoinoneShortTickerMessage } from "./types";

export class CoinoneShortTickerConverter extends BookTickerConverter {
    static convert(
        config: ExchangeConfig,
        rawData: CoinoneShortTickerMessage
    ): BookTickerData {
        const {
            d: {
                qc, // 기준 통화
                tc, // 종목 심볼
                t, // 타임스탬프
                abp, // 매도 최적 호가
                abq, // 매도 최적 수량
                bbp, // 매수 최적 호가
                bbq, // 매수 최적 수량
            },
        } = rawData;

        const bestBid = {
            price: bbp ? parseFloat(bbp) : 0,
            quantity: bbq ? parseFloat(bbq) : 0,
        };

        const bestAsk = {
            price: abp ? parseFloat(abp) : 0,
            quantity: abq ? parseFloat(abq) : 0,
        };

        return {
            exchange: config.exchange,
            exchangeType: config.exchangeType,
            symbol: `${qc}/${tc}`,
            timestamp: t,
            bids: [[bestBid.price, bestBid.quantity]],
            asks: [[bestAsk.price, bestAsk.quantity]],
        };
    }
}
