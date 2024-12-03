/**
 * src/interfaces/ExchangeAdapterInterface.ts
 *
 * Exchange Adapter Interface
 * - 거래소별 어댑터의 표준 인터페이스 정의
 * - 심볼 변환, 구독 관리, 데이터 파싱 기능 정의
 * - WebSocket 설정 관리
 */

import { MarketData } from "../types/data";
import { WebSocketConfig } from "../types/config";
import { ExchangeInfo } from "../types/exchange";

export interface ExchangeAdapterInterface {
    // 심볼 변환
    normalizeSymbol(symbol: string): string;
    denormalizeSymbol(symbol: string): string;

    // 구독 관리
    createSubscriptionMessage(symbols: string[]): string;
    createUnsubscriptionMessage(symbols: string[]): string;

    // 데이터 파싱
    parseMessage(message: string): MarketData | null;
    validateMessage(message: string): boolean;

    // 연결 설정
    getWebSocketConfig(): WebSocketConfig;
    getExchangeInfo(): ExchangeInfo;
}
