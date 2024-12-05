/**
 * File: tests/models/ExchangeCoinRegistry.stress.test.ts
 * Description: ExchangeCoinRegistry 스트레스 테스트
 */

import { ExchangeCoinRegistry } from "../../src/models/ExchangeCoinRegistry"
import { MarketType, OrderBook, Quotation } from "../../src/types/coin.types"
import { CoinBaseInfo } from "../../src/models/CoinInfo"

describe("ExchangeCoinRegistry 스트레스 테스트", () => {
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
        maxOrderBookLevels: 10,
        tradingLimit: {
            minOrderValue: 5,
            maxOrderValue: 100000,
            maxOpenOrders: 200,
            maxPositionSize: 100,
        },
    }

    beforeEach(() => {
        jest.useFakeTimers()
        registry = new ExchangeCoinRegistry(exchangeName)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe("부하 테스트", () => {
        const VOLUME = 100000 // 10만건
        const INTERVAL = 100 // 100ms

        test("대량 호가창 업데이트", async () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )

            const mockQuotation: Quotation = { price: 100, quantity: 1 }
            const startMemory = process.memoryUsage().heapUsed
            const startTime = Date.now()

            for (let i = 0; i < VOLUME; i++) {
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

                if (i % 1000 === 0) {
                    jest.advanceTimersByTime(INTERVAL)
                }
            }

            const endTime = Date.now()
            const endMemory = process.memoryUsage().heapUsed
            const duration = endTime - startTime
            const tps = VOLUME / (duration / 1000)

            expect(tps).toBeGreaterThan(5000) // 5k TPS
            expect(endMemory - startMemory).toBeLessThan(100 * 1024 * 1024) // 100MB
        })

        test("지속적 부하 상황", async () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )

            const metrics: number[] = []
            const mockQuotation: Quotation = { price: 100, quantity: 1 }

            for (let hour = 0; hour < 3600; hour++) {
                for (let i = 0; i < 100; i++) {
                    const orderBook: OrderBook = {
                        lastUpdateId: hour * 100 + i,
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

                jest.advanceTimersByTime(1000)
                metrics.push(process.memoryUsage().heapUsed)
            }

            const baselineMemory = metrics[0]
            const normalizedMetrics = metrics.map((m) => m / baselineMemory)
            const memoryVariance = calculateVariance(normalizedMetrics)

            expect(memoryVariance).toBeLessThan(0.5) // 50% 이내 변동성
        })
    })

    describe("메모리 리크 테스트", () => {
        test("대량의 코인 추가/제거 후 메모리", () => {
            const initialMemory = process.memoryUsage().heapUsed
            const coins: string[] = []

            for (let i = 0; i < 1000; i++) {
                const symbol = `COIN${i}-USDT`
                const coin = { ...baseInfo, symbol }
                registry.addCoin(coin)
                coins.push(symbol)
            }

            coins.forEach((symbol) => {
                const orderBook: OrderBook = {
                    lastUpdateId: 1,
                    timestamp: Date.now(),
                    bids: [{ price: 100, quantity: 1 }],
                    asks: [{ price: 101, quantity: 1 }],
                }
                registry.updateOrderBook(symbol, "SPOT", orderBook)
            })

            jest.advanceTimersByTime(5000)
            global.gc && global.gc()

            const finalMemory = process.memoryUsage().heapUsed
            const memoryGrowthRate =
                (finalMemory - initialMemory) / initialMemory

            expect(memoryGrowthRate).toBeLessThan(0.5) // 50% 이내 증가
        })
    })

    describe("동시성 스트레스 테스트", () => {
        test("다수 코인 동시 업데이트", async () => {
            const COIN_COUNT = 100
            const UPDATE_COUNT = 1000

            const coins = Array.from({ length: COIN_COUNT }, (_, i) => ({
                ...baseInfo,
                symbol: `COIN${i}-USDT`,
            }))
            coins.forEach((coin) => {
                registry.addCoin(coin)
                registry.updateCollectState(
                    coin.symbol,
                    coin.type,
                    "SUBSCRIBED"
                )
            })

            const updates = coins.flatMap((coin) =>
                Array.from({ length: UPDATE_COUNT }, (_, i) => ({
                    symbol: coin.symbol,
                    type: coin.type,
                    orderBook: {
                        lastUpdateId: i,
                        timestamp: Date.now(),
                        bids: [{ price: 100, quantity: 1 }],
                        asks: [{ price: 101, quantity: 1 }],
                    },
                }))
            )

            await Promise.all(
                updates.map((update) =>
                    Promise.resolve(
                        registry.updateOrderBook(
                            update.symbol,
                            update.type,
                            update.orderBook
                        )
                    )
                )
            )

            coins.forEach((coin) => {
                const coinInfo = registry.getCoin(coin.symbol, coin.type)
                expect(coinInfo!.updateCount).toBe(UPDATE_COUNT)
            })
        })
    })

    describe("에러 상황 테스트", () => {
        test("시퀀스 깨짐 상황", () => {
            registry.addCoin(baseInfo)
            registry.updateCollectState(
                baseInfo.symbol,
                baseInfo.type,
                "SUBSCRIBED"
            )

            const mockQuotation: Quotation = { price: 100, quantity: 1 }
            const updates = [1, 2, 5, 3, 4, 6].map((seq) => ({
                lastUpdateId: seq,
                timestamp: Date.now(),
                bids: [mockQuotation],
                asks: [mockQuotation],
            }))

            updates.forEach((orderBook) => {
                registry.updateOrderBook(
                    baseInfo.symbol,
                    baseInfo.type,
                    orderBook
                )
            })

            const coin = registry.getCoin(baseInfo.symbol, baseInfo.type)
            expect(coin!.outOfSequenceCount).toBeGreaterThan(0)
        })
    })
})

function calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b) / numbers.length
    return (
        numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length
    )
}
