/**
 * File: src/types/coin.types.ts
 * Description: 코인 관련 타입 정의
 */

/** 마켓 유형 */
export type MarketType = "SPOT" | "FUTURES"

/** 수집 상태 */
export type CollectState = "READY" | "REQUESTED" | "SUBSCRIBED" | "STOPPED"

/** 거래 상태 */
export type TradeState =
    | "ACTIVE"
    | "POST_ONLY"
    | "BREAK"
    | "CANCEL_ONLY"
    | "SUSPENDED"

/** 호가 정보 */
export interface Quotation {
    readonly price: number // 가격
    readonly quantity: number // 수량
    readonly count?: number // 주문 건수
}

/** 호가창 스냅샷 */
export interface OrderBook {
    readonly bids: Quotation[] // 매수 호가
    readonly asks: Quotation[] // 매도 호가
    readonly timestamp: number // 타임스탬프
    readonly lastUpdateId: number // 마지막 업데이트 ID
}

/** 거래 제한 정보 */
export interface TradingLimit {
    readonly maxLeverage?: number // 최대 레버리지
    readonly minOrderValue: number // 최소 주문 값
    readonly maxOrderValue: number // 최대 주문 값
    readonly maxOpenOrders: number // 최대 미체결 주문 수
    readonly maxPositionSize: number // 최대 포지션 크기
}

/** 거래 상태 정보 */
export interface TradeStateInfo {
    state: TradeState // 현재 거래 상태
    lastStateChange: number // 마지막 상태 변경 시간
    stateChangeReason?: string // 상태 변경 사유
    nextStateChange?: number // 다음 상태 변경 예정 시간
    tradingEnabled: boolean // 거래 가능 여부
    marginEnabled: boolean // 증거금 거래 가능 여부
    limitOrderEnabled: boolean // 지정가 주문 가능 여부
    marketOrderEnabled: boolean // 시장가 주문 가능 여부
    cancelAllowed: boolean // 주문 취소 가능 여부
}
