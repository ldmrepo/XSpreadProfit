import { standardData } from "./standardData";

export class BinanceFuturesDataTransformer {
    static transformToStandardFormat(data: any): standardData {
        return {
            exchange: "binance", // 거래소 이름
            symbol: data.s.replace("USDT", ""), // 심볼 (예: BTCUSDT -> BTC)
            ticker: data.s, // 심볼 (예:
            exchangeType: "futures", // 거래소 타입 (예: 선물, 현물)
            timestamp: data.E, // 이벤트 시간
            bids: data.b.map((bid: [string, string]) => [
                parseFloat(bid[0]),
                parseFloat(bid[1]),
            ]),
            asks: data.a.map((ask: [string, string]) => [
                parseFloat(ask[0]),
                parseFloat(ask[1]),
            ]),
        };
    }
}
