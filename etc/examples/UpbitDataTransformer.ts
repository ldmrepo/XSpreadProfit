import { ExchangeDataTransformer } from "./ExchangeDataTransformer";
import { standardData } from "./standardData";

export class UpbitDataTransformer extends ExchangeDataTransformer {
    static transformToStandardFormat(data: any): standardData {
        const eventTime = new Date(data.tms).toISOString();

        return {
            exchange: "upbit", // 거래
            symbol: data.cd.split("-")[1], // 심볼 (예: KRW-BTC -> BTC)
            exchangeType: "spot", // 거래소 타입 (예: 선물, 현물)
            ticker: data.cd, // 마켓 코드 (예: KRW-BTC)
            timestamp: eventTime, //data.tms, // 타임스탬프
            bids: data.obu.map((entry: any) => [entry.bp, entry.bs]), // 매수 호가 리스트
            asks: data.obu.map((entry: any) => [entry.ap, entry.as]), // 매도 호가 리스트
        };
    }
}
