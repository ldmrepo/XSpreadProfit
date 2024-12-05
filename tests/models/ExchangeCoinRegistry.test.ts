/**
 * File: ./tests/models/ExchangeCoinRegistry.test.ts
 * Description: ExchangeCoinRegistry 테스트
 */

import { ExchangeCoinRegistry } from "../../src/models/ExchangeCoinRegistry"
import {
    CollectState,
    MarketType,
    OrderBook,
    Quotation,
} from "../../src/types/coin.types"
import { CoinBaseInfo, CoinInfo } from "../../src/models/CoinInfo"

describe("ExchangeCoinRegistry", () => {
    let registry: ExchangeCoinRegistry
    const exchangeName = "TestExchange"

    beforeEach(() => {
        registry = new ExchangeCoinRegistry(exchangeName)
    })

    describe("기본 기능", () => {
        test("거래소 이름 조회", () => {
            expect(registry.getExchangeName()).toBe(exchangeName)
        })

        test("초기 메트릭스 값 확인", () => {
            const metrics = registry.getMetrics()
            expect(metrics.totalCoins).toBe(0)
            expect(metrics.activeCoins).toBe(0)
            expect(metrics.tradableCoins).toBe(0)
            expect(metrics.totalUpdates).toBe(0)
            expect(metrics.totalErrors).toBe(0)
        })
    })

    describe("코인 관리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 10,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        test("코인 추가", () => {
            expect(registry.addCoin(baseInfo)).toBe(true)
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin).toBeDefined()
            expect(coin!.symbol).toBe(baseInfo.symbol)
            expect(coin!.type).toBe(baseInfo.type)
        })

        test("중복 코인 추가 방지", () => {
            expect(registry.addCoin(baseInfo)).toBe(true)
            expect(registry.addCoin(baseInfo)).toBe(false)
        })

        test("없는 코인 조회", () => {
            expect(registry.getCoin("NONE-USDT", "SPOT")).toBeUndefined()
        })
    })

    describe("상태 관리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 10,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        beforeEach(() => {
            registry.addCoin(baseInfo)
        })

        test("수집 상태 업데이트", () => {
            const newState: CollectState = "SUBSCRIBED"
            expect(
                registry.updateCollectState(
                    baseInfo.symbol,
                    baseInfo.type,
                    newState
                )
            ).toBe(true)
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin!.collectState).toBe(newState)
        })

        test("없는 코인 상태 업데이트", () => {
            expect(
                registry.updateCollectState("NONE-USDT", "SPOT", "SUBSCRIBED")
            ).toBe(false)
        })

        test("상태별 코인 조회", () => {
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )
            const coins = registry.getCoinsByCollectState("SUBSCRIBED")
            expect(coins).toHaveLength(1)
            expect(coins[0].symbol).toBe(baseInfo.symbol)
        })
    })

    describe("호가창 관리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 2,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        const mockQuotations: Quotation[] = [
            { price: 100, quantity: 1, count: 1 },
            { price: 99, quantity: 2, count: 2 },
            { price: 98, quantity: 3, count: 1 },
        ]

        const mockOrderBook: OrderBook = {
            bids: mockQuotations,
            asks: mockQuotations,
            timestamp: Date.now(),
            lastUpdateId: 1,
        }

        beforeEach(() => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )
        })

        test("호가창 초기 업데이트", () => {
            expect(
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    mockOrderBook
                )
            ).toBe(true)
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin!.orderBook).toBeDefined()
            expect(coin!.orderBook!.bids).toHaveLength(2) // maxOrderBookLevels
            expect(coin!.orderBook!.asks).toHaveLength(2) // maxOrderBookLevels
        })

        test("이전 시퀀스 업데이트 거부", () => {
            registry.updateOrderBook(
                baseInfo.symbol,
                baseInfo.type,
                mockOrderBook
            )

            const oldOrderBook: OrderBook = {
                ...mockOrderBook,
                lastUpdateId: 0,
            }
            expect(
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    oldOrderBook
                )
            ).toBe(false)
        })

        test("미구독 코인 업데이트 거부", () => {
            registry.updateCollectState(baseInfo.symbol, baseInfo.type, "READY")
            expect(
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    mockOrderBook
                )
            ).toBe(false)
        })
    })

    describe("에러 처리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 10,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        beforeEach(() => {
            registry.addCoin(baseInfo)
        })

        test("에러 기록", () => {
            const errorMessage = "Test Error"
            expect(
                registry.recordError(
                    baseInfo.symbol,
                    baseInfo.type,
                    errorMessage
                )
            ).toBe(true)
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin!.errorCount).toBe(1)
            expect(coin!.lastErrorMessage).toBe(errorMessage)
        })

        test("없는 코인 에러 기록", () => {
            expect(registry.recordError("NONE-USDT", "SPOT", "Error")).toBe(
                false
            )
        })
    })

    describe("성능 테스트", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 10,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        const mockQuotation: Quotation = {
            price: 100,
            quantity: 1,
            count: 1,
        }

        test("대량의 상태 변경 처리", () => {
            registry.addCoin(baseInfo)
            const startTime = Date.now()

            for (let i = 0; i < 1000; i++) {
                registry.updateCollectState(
                    baseInfo.symbol,
                    baseInfo.type,
                    "SUBSCRIBED"
                )
                registry.updateCollectState(
                    baseInfo.symbol,
                    baseInfo.type,
                    "READY"
                )
            }

            const duration = Date.now() - startTime
            expect(duration).toBeLessThan(1000) // 1초 이내 처리
        })

        test("대량의 호가창 업데이트 처리", () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )
            const startTime = Date.now()

            for (let i = 0; i < 1000; i++) {
                const orderBook: OrderBook = {
                    lastUpdateId: i,
                    timestamp: Date.now(),
                    bids: [mockQuotation],
                    asks: [mockQuotation],
                }
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    orderBook
                )
            }

            const duration = Date.now() - startTime
            expect(duration).toBeLessThan(1000) // 1초 이내 처리
        })
    })
    describe("메모리 관리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 2,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        test("OrderBook 배열 객체 재사용", () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )

            // 첫 번째 업데이트
            const orderBook1: OrderBook = {
                bids: [{ price: 100, quantity: 1 }],
                asks: [{ price: 101, quantity: 1 }],
                timestamp: Date.now(),
                lastUpdateId: 1,
            }
            registry.updateOrderBook(baseInfo.symbol, baseInfo.type, orderBook1)
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            const firstBookBids = coin!.orderBook!.bids
            const firstBookAsks = coin!.orderBook!.asks

            // 두 번째 업데이트
            const orderBook2: OrderBook = {
                bids: [{ price: 102, quantity: 2 }],
                asks: [{ price: 103, quantity: 2 }],
                timestamp: Date.now(),
                lastUpdateId: 2,
            }
            registry.updateOrderBook(baseInfo.symbol, baseInfo.type, orderBook2)

            // 배열 객체가 재사용되었는지 확인
            expect(coin!.orderBook!.bids).toBe(firstBookBids) // 동일 배열 객체
            expect(coin!.orderBook!.asks).toBe(firstBookAsks) // 동일 배열 객체
        })

        test("대량 업데이트 시 메모리 효율성", () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )

            const mockQuotation: Quotation = { price: 100, quantity: 1 }
            const samples = []
            const sampleSize = 100

            // 메모리 사용량 샘플링
            for (let i = 0; i < sampleSize; i++) {
                const orderBook: OrderBook = {
                    lastUpdateId: i,
                    timestamp: Date.now(),
                    bids: [mockQuotation],
                    asks: [mockQuotation],
                }
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    orderBook
                )

                if (i % 10 === 0) {
                    // 10회마다 샘플링
                    samples.push(process.memoryUsage().heapUsed)
                }
            }

            // 메모리 증가율이 선형적이지 않은지 확인
            const increases = []
            for (let i = 1; i < samples.length; i++) {
                increases.push(samples[i] - samples[i - 1])
            }

            // 증가율의 표준편차가 평균의 50% 이하인지 확인
            const avg = increases.reduce((a, b) => a + b) / increases.length
            const variance =
                increases.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
                increases.length
            const stdDev = Math.sqrt(variance)

            expect(stdDev).toBeLessThan(avg * 0.5) // 증가율이 안정적
        })
    })

    describe("동시성 처리", () => {
        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 2,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        test("동시 상태 업데이트", async () => {
            registry.addCoin(baseInfo)

            const updates = Array(100)
                .fill(0)
                .map((_, i) =>
                    registry.updateCollectState(
                        baseInfo.symbol,
                        baseInfo.type,
                        i % 2 === 0 ? "SUBSCRIBED" : "READY"
                    )
                )

            await Promise.all(updates.map((p) => Promise.resolve(p)))
            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin!.stateChangeCount).toBe(100)
        })
    })

    describe("메트릭 정확성", () => {
        let registry: ExchangeCoinRegistry
        const exchangeName = "TestExchange"

        const baseInfo: Omit<CoinBaseInfo, "exchange"> = {
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            type: "SPOT" as MarketType,
            tickSize: 0.1,
            stepSize: 0.001,
            minOrderSize: 0.001,
            quotePrecision: 2,
            basePrecision: 8,
            maxOrderBookLevels: 2,
            tradingLimit: {
                minOrderValue: 5,
                maxOrderValue: 100000,
                maxOpenOrders: 200,
                maxPositionSize: 100,
            },
        }

        const mockQuotation: Quotation = { price: 100, quantity: 1 }

        beforeEach(() => {
            jest.useFakeTimers()
            registry = new ExchangeCoinRegistry(exchangeName)
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        test("업데이트 카운트 정확성", () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )
            jest.advanceTimersByTime(1100)

            // 초기값 저장
            const initialMetrics = registry.getMetrics()

            // 업데이트 수행
            const updateCount = 100
            for (let i = 0; i < updateCount; i++) {
                const orderBook: OrderBook = {
                    lastUpdateId: i + 1,
                    timestamp: Date.now(),
                    bids: [mockQuotation],
                    asks: [mockQuotation],
                }
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    orderBook
                )
            }

            jest.advanceTimersByTime(1100)

            const finalMetrics = registry.getMetrics()
            expect(finalMetrics.totalUpdates).toBe(updateCount)
        })

        test("에러율 범위 검증", () => {
            registry.addCoin(baseInfo)
            jest.advanceTimersByTime(1000)

            // 에러 발생
            const errorCount = 10
            for (let i = 0; i < errorCount; i++) {
                registry.recordError(
                    baseInfo.symbol,
                    baseInfo.type,
                    "Test Error"
                )
            }

            jest.advanceTimersByTime(1000)
            const metrics = registry.getMetrics()

            // 에러율이 0보다 크고 의미 있는 범위 내인지 확인
            expect(metrics.errorRate).toBeGreaterThan(0)
            expect(metrics.errorRate).toBeLessThan(errorCount * 2) // 충분히 큰 상한선
            expect(metrics.totalErrors).toBe(errorCount)
        })

        test("활성 코인 카운트", () => {
            registry.addCoin(baseInfo)
            jest.advanceTimersByTime(1100)
            let metrics = registry.getMetrics()
            expect(metrics.activeCoins).toBe(0) // 초기 상태는 READY

            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )
            jest.advanceTimersByTime(1100)
            metrics = registry.getMetrics()
            expect(metrics.activeCoins).toBe(1) // SUBSCRIBED 상태로 변경

            registry.updateCollectState(baseInfo.symbol, baseInfo.type, "READY")
            jest.advanceTimersByTime(1100)
            metrics = registry.getMetrics()
            expect(metrics.activeCoins).toBe(0) // READY 상태로 변경
        })

        test("전체 코인 카운트", () => {
            registry.addCoin(baseInfo)
            jest.advanceTimersByTime(1100)
            let metrics = registry.getMetrics()
            expect(metrics.totalCoins).toBe(1) // 첫 번째 코인

            const newCoin = { ...baseInfo, symbol: "ETH-USDT" }
            registry.addCoin(newCoin)
            jest.advanceTimersByTime(1100)
            metrics = registry.getMetrics()
            expect(metrics.totalCoins).toBe(2) // 두 번째 코인 추가
        })
    })
})
