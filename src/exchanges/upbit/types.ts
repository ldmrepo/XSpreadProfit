/**
 * Path: src/exchanges/upbit/types.ts
 */

// 구독 메시지 타입
export interface UpbitSubscription {
    ticket: string; // 식별값
    type: "orderbook"; // 호가 데이터 타입
    codes: string[]; // 마켓 코드 (예: KRW-BTC)
    format?: "SIMPLE"; // 응답 포맷
}

// 호가 유닛 타입
interface OrderBookUnit {
    ask_price: number; // 매도 호가
    bid_price: number; // 매수 호가
    ask_size: number; // 매도 잔량
    bid_size: number; // 매수 잔량
}

// 업비트 호가 메시지 타입
export interface UpbitOrderBookMessage {
    type: "orderbook"; // 메시지 타입
    code: string; // 마켓 코드
    timestamp: number; // 타임스탬프
    total_ask_size: number; // 매도 잔량 합
    total_bid_size: number; // 매수 잔량 합
    orderbook_units: OrderBookUnit[]; // 호가 정보
}

// 업비트 WebSocket 메시지 유니온 타입
export type UpbitRawMessage = UpbitOrderBookMessage;

// 업비트 마켓 코드를 표준 심볼로 변환하는 유틸리티 함수
export const convertUpbitMarketCode = {
    toStandardSymbol: (marketCode: string): string => {
        // KRW-BTC -> BTCKRW
        const [quote, base] = marketCode.split("-");
        return `${base}${quote}`;
    },
    toMarketCode: (symbol: string): string => {
        // BTCKRW -> KRW-BTC
        const base = symbol.slice(0, 3);
        const quote = symbol.slice(3);
        return `${quote}-${base}`;
    },
};
