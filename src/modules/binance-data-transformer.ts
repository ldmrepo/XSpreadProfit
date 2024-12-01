import { ExchangeDataTransformer } from "../interfaces/exchange-data-transformer";
import { StandardData } from "../types/market";

export class BinanceDataTransformer extends ExchangeDataTransformer {
    static transformToStandardFormat(data: any): StandardData {
        // data.E 타임스탬프를 사용하여 이벤트 시간을 저장
        // 타임스템를 년-월-일 시:분:초 밀리초 형식으로 변환
        const eventTime = new Date(data.E).toISOString();
        // 미국시간을 한국시간으로 변환
        return {
            exchange: "binance", // 거래소 이름
            symbol: data.s.replace("USDT", ""), // 심볼 (예: BTCUSDT -> BTC)
            ticker: data.s, // 심볼 (예: BTCUSDT)
            exchangeType: "spot", // 거래소 타입 (예: 선물, 현물
            timestamp: data.E, //data.E, // 이벤트 타임스탬프
            bids: data.b.map((bid: [string, string]) => [
                parseFloat(bid[0]),
                parseFloat(bid[1]),
            ]), // 매수 호가 리스트
            asks: data.a.map((ask: [string, string]) => [
                parseFloat(ask[0]),
                parseFloat(ask[1]),
            ]), // 매도 호가 리스트
        };
    }
}
