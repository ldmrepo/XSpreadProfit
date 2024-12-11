/**
 * Path: src/exchanges/bithumb/types.ts
 */

// 구독 메시지 타입
export interface BithumbSubscription {
    type: string; // "orderbookdepth"
    symbols: string[]; // ["BTC_KRW"]
    tickTypes: string[]; // ["1H"]
}

// 빗썸 호가 메시지 타입
// 빗썸 호가 메시지 타입
export interface BithumbOrderBookMessage {
    type: string; // 메시지 타입 (예: "orderbookdepth")
    content: {
        symbol: string; // 종목 심볼 (예: "BTC_KRW")
        timestamp: number; // 타임스탬프 (밀리초)
        datetime: string; // ISO 8601 형식의 날짜 및 시간
        asks: OrderBookLevel[]; // 매도 호가 데이터
        bids: OrderBookLevel[]; // 매수 호가 데이터
    };
}

// 개별 호가 데이터 구조
export interface OrderBookLevel {
    price: number; // 가격
    quantity: number; // 수량
}

// 빗썸 WebSocket 메시지 유니온 타입
export type BithumbRawMessage = BithumbOrderBookMessage;

// 빗썸 마켓 정보 타입
export interface BithumbMarketInfo {
    symbol: string;
    order_currency: string;
    payment_currency: string;
    min_price: string;
    max_price: string;
    tick_size: string;
    min_order_size: string;
    is_active: boolean;
}

// 심볼 변환 유틸리티
export const convertBithumbSymbol = {
    toStandardSymbol: (bithumbSymbol: string): string => {
        // BTC_KRW -> BTCKRW
        return bithumbSymbol.replace("_", "");
    },
    toBithumbSymbol: (symbol: string): string => {
        // BTCKRW -> BTC_KRW
        const base = symbol.slice(0, 3);
        const quote = symbol.slice(3);
        return `${base}_${quote}`;
    },
};
