/**
 * Path: src/exchanges/common/types.ts
 */

// 표준화된 Book Ticker 데이터 타입
export interface BookTickerData {
    symbol: string // 심볼 (예: BTCUSDT)
    exchange: string // 거래소명 (예: binance, upbit)
    timestamp: number // 타임스탬프
    bids: [number, number][] // [가격, 수량][] 형태의 매수 호가
    asks: [number, number][] // [가격, 수량][] 형태의 매도 호가
}

// 거래소별 원시 데이터를 표준 데이터로 변환하는 인터페이스
export abstract class BookTickerConverter {
    static convert(rawData: unknown): BookTickerData {
        throw new Error("convert method must be implemented")
    }
}
export interface ExchangeInfo {
    marketSymbol: string
    baseSymbol: string
    quoteSymbol: string
    type: string
    exchange: string
    status: string
    isDepositEnabled?: boolean // 입금 가능 여부
    isWithdrawalEnabled?: boolean // 출금 가능 여부
    additionalInfo?: Record<string, unknown>
}
