/**
 * Path: src/exchanges/binance/BinanceBookTickerConverter.ts
 */
import { BookTickerConverter, BookTickerData } from "../common/types";
import { BinanceBookTickerMessage, BinanceDepthMessage } from "./types";

export class BinanceBookTickerConverter extends BookTickerConverter {
    static convert(rawData: BinanceBookTickerMessage): BookTickerData {
        return {
            symbol: rawData.s,
            exchange: "binance",
            timestamp: Date.now(),
            bids: [[parseFloat(rawData.b), parseFloat(rawData.B)]],
            asks: [[parseFloat(rawData.a), parseFloat(rawData.A)]],
        };
    }
    static convertFromDepth(
        rawData: BinanceDepthMessage,
        symbol: string
    ): BookTickerData {
        // depth 데이터에서 최우선 호가만 사용
        const bestBid = rawData.bids[0];
        const bestAsk = rawData.asks[0];

        return {
            symbol: symbol, // 심볼은 외부에서 주입
            exchange: "binance",
            timestamp: Date.now(), // Binance depth 메시지는 타임스탬프 미포함
            bids: [[parseFloat(bestBid[0]), parseFloat(bestBid[1])]],
            asks: [[parseFloat(bestAsk[0]), parseFloat(bestAsk[1])]],
        };
    }
    static convertFullDepth(
        rawData: BinanceDepthMessage,
        symbol: string
    ): BookTickerData & {
        lastUpdateId: number;
        fullBids: [number, number][];
        fullAsks: [number, number][];
    } {
        return {
            symbol: symbol,
            exchange: "binance",
            timestamp: Date.now(),
            // 최우선 호가
            bids: [
                [
                    parseFloat(rawData.bids[0][0]),
                    parseFloat(rawData.bids[0][1]),
                ],
            ],
            asks: [
                [
                    parseFloat(rawData.asks[0][0]),
                    parseFloat(rawData.asks[0][1]),
                ],
            ],
            // 추가 정보
            lastUpdateId: rawData.lastUpdateId,
            fullBids: rawData.bids.map(([price, qty]) => [
                parseFloat(price),
                parseFloat(qty),
            ]),
            fullAsks: rawData.asks.map(([price, qty]) => [
                parseFloat(price),
                parseFloat(qty),
            ]),
        };
    }
}