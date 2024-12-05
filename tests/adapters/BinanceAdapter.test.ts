/**
 * src/tests/BinanceAdapter.test.ts
 *
 * BinanceAdapter 테스트
 * - BinanceAdapter 클래스의 WebSocket 및 REST API 요청/응답 테스트
 * - 실제 바이낸스 데이터 포맷을 기반으로 테스트 수행
 */

import { BinanceAdapter } from "../../src/adapters/binance/BinanceAdapter"
import {
    WebSocketMessage,
    SubscriptionRequest,
    StandardizedResponse,
} from "../../src/interfaces/ExchangeInterface"

// 테스트 라이브러리
import axios from "axios"
import { jest } from "@jest/globals"

// axios 모의(mock) 설정
jest.mock("axios")
const mockedAxios = axios as jest.Mocked<typeof axios>

// BinanceAdapter 인스턴스 생성
const adapter = new BinanceAdapter()

describe("BinanceAdapter 테스트", () => {
    describe("WebSocket 요청 생성", () => {
        it("현물 구독 요청 생성", () => {
            // 테스트 입력 데이터
            const params = ["btcusdt@aggTrade"]
            const requestId = 1

            // 함수 호출
            const result: SubscriptionRequest =
                adapter.requestSpotSubscribeStream(params, requestId)

            // 예상 결과
            const expected: SubscriptionRequest = {
                method: "SUBSCRIBE",
                params,
                id: requestId,
            }

            // 결과 검증
            expect(result).toEqual(expected)
        })

        it("선물 구독 요청 생성", () => {
            const params = ["btcusdt@aggTrade"]
            const requestId = 2

            const result: SubscriptionRequest =
                adapter.requestFuturesSubscribeStream(params, requestId)

            const expected: SubscriptionRequest = {
                method: "SUBSCRIBE",
                params,
                id: requestId,
            }

            expect(result).toEqual(expected)
        })

        it("현물 구독 취소 요청 생성", () => {
            const params = ["btcusdt@aggTrade"]
            const requestId = 3

            const result: SubscriptionRequest =
                adapter.requestSpotUnsubscribeStream(params, requestId)

            const expected: SubscriptionRequest = {
                method: "UNSUBSCRIBE",
                params,
                id: requestId,
            }

            expect(result).toEqual(expected)
        })

        it("선물 구독 취소 요청 생성", () => {
            const params = ["btcusdt@aggTrade"]
            const requestId = 4

            const result: SubscriptionRequest =
                adapter.requestFuturesUnsubscribeStream(params, requestId)

            const expected: SubscriptionRequest = {
                method: "UNSUBSCRIBE",
                params,
                id: requestId,
            }

            expect(result).toEqual(expected)
        })
    })

    describe("REST API 요청 테스트", () => {
        it("현물 거래소 정보 요청", () => {
            // 메서드 호출
            const result = adapter.requestSpotExchangeInfoApi()

            // 예상 결과
            const expected = {
                url: "https://api.binance.com/api/v3/exchangeInfo",
            }

            // 결과 검증
            expect(result).toEqual(expected)
        })

        it("선물 거래소 정보 요청", () => {
            // 메서드 호출
            const result = adapter.requestFuturesExchangeInfoApi()

            // 예상 결과
            const expected = {
                url: "https://fapi.binance.com/fapi/v1/exchangeInfo",
            }

            // 결과 검증
            expect(result).toEqual(expected)
        })
    })

    describe("WebSocket 메시지 파싱 테스트", () => {
        it("구독 응답 메시지 파싱", () => {
            const message: WebSocketMessage = {
                type: "SUBSCRIBE",
                data: { result: null, id: 1 },
            }

            const result = adapter.parseSocketMessage(message)

            expect(result.type).toBe("SUBSCRIPTION")
            expect(result.data.standard.success).toBe(true)
        })

        it("오더북 업데이트 메시지 파싱", () => {
            const message: WebSocketMessage = {
                type: "ORDER_BOOK",
                data: {
                    s: "BTCUSDT",
                    lastUpdateId: 100,
                    bids: [["50000.00", "0.5"]],
                    asks: [["50001.00", "1.0"]],
                },
            }

            const result = adapter.parseSocketMessage(message)

            expect(result.type).toBe("ORDER_BOOK")
            expect(result.data.standard.symbol).toBe("BTCUSDT")
            expect(result.data.standard.bids).toEqual([
                { price: 50000.0, quantity: 0.5 },
            ])
            expect(result.data.standard.asks).toEqual([
                { price: 50001.0, quantity: 1.0 },
            ])
        })

        it("알 수 없는 메시지 파싱", () => {
            const message: WebSocketMessage = {
                type: "UNKNOWN",
                data: {},
            }

            const result = adapter.parseSocketMessage(message)

            expect(result.type).toBe("UNKNOWN")
        })
    })
})
/**
 * src/tests/BinanceAdapter.test.ts
 *
 * BinanceAdapter 테스트
 * - BinanceAdapter 클래스의 REST API 응답 파싱 메서드 테스트
 * - 실제 바이낸스 데이터 포맷을 기반으로 표준화된 구조 검증
 */

describe("BinanceAdapter REST API 응답 파싱 테스트", () => {
    const adapter = new BinanceAdapter()

    describe("REST API 응답 테스트", () => {
        it("현물 거래소 정보 응답 파싱", () => {
            // Mock 데이터: Binance Spot API 응답
            const mockData = {
                symbols: [
                    {
                        symbol: "BTCUSDT",
                        status: "TRADING",
                        baseAsset: "BTC",
                        quoteAsset: "USDT",
                        filters: [
                            { filterType: "PRICE_FILTER", tickSize: "0.01" },
                            { filterType: "LOT_SIZE", minQty: "0.0001" },
                        ],
                    },
                ],
            }

            // 메서드 호출
            const result: StandardizedResponse<any> =
                adapter.responseSpotExchangeInfoApi(mockData)

            // 결과 검증
            expect(result.standard.symbols).toEqual([
                {
                    symbol: "BTCUSDT",
                    status: "TRADING",
                    baseAsset: "BTC",
                    quoteAsset: "USDT",
                    filters: [
                        { filterType: "PRICE_FILTER", tickSize: "0.01" },
                        { filterType: "LOT_SIZE", minQty: "0.0001" },
                    ],
                },
            ])

            expect(result.specific?.rawResponse).toEqual(mockData)
        })

        it("선물 거래소 정보 응답 파싱", () => {
            // Mock 데이터: Binance Futures API 응답
            const mockData = {
                symbols: [
                    {
                        symbol: "ETHUSDT",
                        status: "TRADING",
                        baseAsset: "ETH",
                        quoteAsset: "USDT",
                        filters: [
                            { filterType: "PRICE_FILTER", tickSize: "0.01" },
                            { filterType: "LOT_SIZE", minQty: "0.001" },
                        ],
                    },
                ],
            }

            // 메서드 호출
            const result: StandardizedResponse<any> =
                adapter.responseFuturesExchangeInfoApi(mockData)

            // 결과 검증
            expect(result.standard.symbols).toEqual([
                {
                    symbol: "ETHUSDT",
                    status: "TRADING",
                    baseAsset: "ETH",
                    quoteAsset: "USDT",
                    filters: [
                        { filterType: "PRICE_FILTER", tickSize: "0.01" },
                        { filterType: "LOT_SIZE", minQty: "0.001" },
                    ],
                },
            ])

            expect(result.specific?.rawResponse).toEqual(mockData)
        })

        it("현물 심볼 리스트 응답 파싱", () => {
            // Mock 데이터: Binance Spot API 심볼 리스트
            const mockData = {
                symbols: [
                    { symbol: "BTCUSDT" },
                    { symbol: "ETHUSDT" },
                    { symbol: "BNBUSDT" },
                ],
            }

            // 메서드 호출
            const result: StandardizedResponse<string[]> =
                adapter.responseSpotSymbolsApi(mockData)

            // 결과 검증
            expect(result.standard).toEqual(["BTCUSDT", "ETHUSDT", "BNBUSDT"])

            expect(result.specific?.rawResponse).toEqual(mockData)
        })

        it("선물 심볼 리스트 응답 파싱", () => {
            // Mock 데이터: Binance Futures API 심볼 리스트
            const mockData = {
                symbols: [
                    { symbol: "BTCUSDT" },
                    { symbol: "ETHUSDT" },
                    { symbol: "SOLUSDT" },
                ],
            }

            // 메서드 호출
            const result: StandardizedResponse<string[]> =
                adapter.responseFuturesSymbolsApi(mockData)

            // 결과 검증
            expect(result.standard).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"])

            expect(result.specific?.rawResponse).toEqual(mockData)
        })
    })
})
