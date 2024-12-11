/**
 * Path: src/exchanges/coinone/types.ts
 */

// 구독 메시지 타입
export interface CoinoneSubscription {
    request_type: string;
    channel: string;
    topic: {
        quote_currency: string;
        target_currency: string;
    };
}

// 호가 데이터 타입
interface OrderBookLevel {
    price: string;
    quantity: string;
}

// 코인원 호가 메시지 타입
export interface CoinoneOrderBookMessage {
    type: "orderbook";
    market: string; // "BTC-KRW"
    timestamp: number;
    orderbook: {
        asks: OrderBookLevel[];
        bids: OrderBookLevel[];
    };
}

// 코인원 WebSocket 메시지 유니온 타입
export type CoinoneRawMessage = CoinoneOrderBookMessage;

// 코인원 마켓 정보 타입
export interface CoinoneMarketInfo {
    market: string;
    base_asset: string;
    quote_asset: string;
    status: string;
    trading_status: string;
    min_price: string;
    max_price: string;
    tick_size: string;
    min_quantity: string;
}
export interface CoinoneTickerMessage {
    response_type: string; // 항상 "DATA"
    channel: string; // 항상 "TICKER"
    data: {
        quote_currency: string; // 기준 통화 (예: KRW)
        target_currency: string; // 종목 심볼 (예: BTC)
        timestamp: number; // 데이터 생성 시간 (밀리초)
        ask_best_price?: string; // 매도 최적 가격 (없을 경우 null)
        ask_best_qty?: string; // 매도 최적 수량 (없을 경우 null)
        bid_best_price?: string; // 매수 최적 가격 (없을 경우 null)
        bid_best_qty?: string; // 매수 최적 수량 (없을 경우 null)
    };
}
export interface CoinoneShortTickerMessage {
    r: string; // "DATA"
    c: string; // "TICKER"
    d: {
        qc: string; // 기준 통화 (예: KRW)
        tc: string; // 종목 심볼 (예: BTC)
        t: number; // 데이터 생성 시간 (밀리초)
        qv?: string; // 24시간 체결 금액
        tv?: string; // 24시간 체결량
        fi?: string; // 시가
        lo?: string; // 저가
        hi?: string; // 고가
        la?: string; // 종가
        vp?: string; // 체결 강도 (0% ~ 500%)
        abp?: string; // 매도 최적 호가
        abq?: string; // 매도 최적 수량
        bbp?: string; // 매수 최적 호가
        bbq?: string; // 매수 최적 수량
        i?: string; // 티커 ID
        yfi?: string; // 전일 시가
        ylo?: string; // 전일 저가
        yhi?: string; // 전일 고가
        yla?: string; // 전일 종가
        yqv?: string; // 전일 체결 금액
        ytv?: string; // 전일 체결량
    };
}
// 심볼 변환 유틸리티
export const convertCoinoneMarketCode = {
    toStandardSymbol: (marketCode: string): string => {
        // BTC-KRW -> BTCKRW
        const [base, quote] = marketCode.split("-");
        return `${base}${quote}`;
    },
    toMarketCode: (symbol: string): string => {
        // BTCKRW -> BTC-KRW
        const base = symbol.slice(0, 3);
        const quote = symbol.slice(3);
        return `${base}-${quote}`;
    },
};
