/**
 * File: src/models/CoinInfo.ts
 * Description: 코인 정보 데이터 모델
 */

import {
    MarketType,
    CollectState,
    TradeStateInfo,
    OrderBook,
    TradingLimit,
} from "../types/coin.types"

/** 코인 기본 정보 */
export interface CoinBaseInfo {
    readonly symbol: string // 코인 심볼 (예: BTC-USDT)
    readonly baseAsset: string // 기초 자산 (예: BTC)
    readonly quoteAsset: string // 견적 자산 (예: USDT)
    readonly exchange: string // 거래소
    readonly type: MarketType // 마켓 타입
    readonly tickSize: number // 최소 가격 단위
    readonly stepSize: number // 최소 수량 단위
    readonly minOrderSize: number // 최소 주문 수량
    readonly quotePrecision: number // 견적 자산 소수점 자리수
    readonly basePrecision: number // 기초 자산 소수점 자리수
    readonly maxOrderBookLevels: number // 최대 호가 레벨 수
    readonly tradingLimit: TradingLimit // 거래 제한 정보
}

/** 코인 정보 */
export interface CoinInfo extends CoinBaseInfo {
    // 상태 정보
    collectState: CollectState // 수집 상태
    lastStateChange: number // 마지막 상태 변경 시간
    stateChangeCount: number // 상태 변경 횟수

    // 거래 상태 정보
    tradeStateInfo: TradeStateInfo

    // 호가창 정보
    orderBook?: OrderBook

    // 메트릭 정보
    updateCount: number // 전체 업데이트 수
    errorCount: number // 전체 에러 수
    lastUpdateTime: number // 마지막 업데이트 시간
    lastErrorTime?: number // 마지막 에러 발생 시간
    lastErrorMessage?: string // 마지막 에러 메시지
    avgUpdateInterval: number // 평균 업데이트 간격 (ms)
    subscriptionCount: number // 구독 시도 횟수
    recoveryCount: number // 복구 시도 횟수
    outOfSequenceCount: number // 시퀀스 오류 횟수
}

/** 코인 정보 생성 */
export function createCoinInfo(baseInfo: CoinBaseInfo): CoinInfo {
    return {
        ...baseInfo,
        collectState: "READY",
        lastStateChange: Date.now(),
        stateChangeCount: 0,
        tradeStateInfo: {
            state: "ACTIVE",
            lastStateChange: Date.now(),
            tradingEnabled: true,
            marginEnabled: true,
            limitOrderEnabled: true,
            marketOrderEnabled: true,
            cancelAllowed: true,
        },
        updateCount: 0,
        errorCount: 0,
        lastUpdateTime: Date.now(),
        avgUpdateInterval: 0,
        subscriptionCount: 0,
        recoveryCount: 0,
        outOfSequenceCount: 0,
    }
}
