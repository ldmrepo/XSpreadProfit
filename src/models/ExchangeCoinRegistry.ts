/**
 * File: src/models/ExchangeCoinRegistry.ts
 * Description: 단일 거래소의 코인 정보를 관리하는 레지스트리
 */

import { CollectState, TradeState, OrderBook } from "./coin.types"
import { CoinInfo, CoinBaseInfo, createCoinInfo } from "./CoinInfo"

interface RegistryMetrics {
    timestamp: number
    totalCoins: number
    activeCoins: number
    tradableCoins: number
    totalUpdates: number
    totalErrors: number
    updateRate: number
    errorRate: number
    memoryUsage: number
}

class MetricsManager {
    private lastUpdate = Date.now()
    private updateCount = 0
    private errorCount = 0
    private currentMetrics: RegistryMetrics = {
        timestamp: this.lastUpdate,
        totalCoins: 0,
        activeCoins: 0,
        tradableCoins: 0,
        totalUpdates: 0,
        totalErrors: 0,
        updateRate: 0,
        errorRate: 0,
        memoryUsage: 0,
    }

    public recordUpdate() {
        this.updateCount++
    }

    public recordError() {
        this.errorCount++
    }

    public getMetrics(
        totalCoins: number,
        activeCoins: number,
        tradableCoins: number
    ): Readonly<RegistryMetrics> {
        const now = Date.now()
        if (now - this.lastUpdate >= 1000) {
            const intervalSec = (now - this.lastUpdate) / 1000

            this.currentMetrics.timestamp = now
            this.currentMetrics.totalCoins = totalCoins
            this.currentMetrics.activeCoins = activeCoins
            this.currentMetrics.tradableCoins = tradableCoins
            this.currentMetrics.totalUpdates = this.updateCount
            this.currentMetrics.totalErrors = this.errorCount
            this.currentMetrics.updateRate = this.updateCount / intervalSec
            this.currentMetrics.errorRate = this.errorCount / intervalSec
            this.currentMetrics.memoryUsage = process.memoryUsage().heapUsed

            this.updateCount = 0
            this.errorCount = 0
            this.lastUpdate = now
        }
        return this.currentMetrics
    }
}

export class ExchangeCoinRegistry {
    private readonly coins = new Map<string, CoinInfo>()
    private readonly stateIndex = new Map<CollectState, Set<string>>()
    private readonly orderBookPool = new Array<OrderBook>()
    private readonly metrics: MetricsManager
    private activeCoinsCount = 0
    private tradableCoinsCount = 0
    private lastTimestamp = Date.now()
    private readonly symbolTypeCache = new Map<string, string>()

    constructor(private readonly exchangeName: string) {
        this.metrics = new MetricsManager()

        for (const state of [
            "READY",
            "REQUESTED",
            "SUBSCRIBED",
            "STOPPED",
        ] as CollectState[]) {
            this.stateIndex.set(state, new Set())
        }
    }

    public addCoin(baseInfo: Omit<CoinBaseInfo, "exchange">): boolean {
        const id = this.getCachedId(baseInfo.symbol, baseInfo.type)
        if (this.coins.has(id)) return false

        const coin = createCoinInfo({
            ...baseInfo,
            exchange: this.exchangeName,
        })
        this.coins.set(id, coin)
        this.stateIndex.get(coin.collectState)?.add(id)

        if (coin.collectState === "SUBSCRIBED") this.activeCoinsCount++
        if (coin.tradeStateInfo.state === "ACTIVE") this.tradableCoinsCount++

        return true
    }

    public getCoin(symbol: string, type: string): CoinInfo | undefined {
        return this.coins.get(this.getCachedId(symbol, type))
    }
    public getCoins(): CoinInfo[] {
        return Array.from(this.coins.values())
    }

    public updateCollectState(
        symbol: string,
        type: string,
        newState: CollectState
    ): boolean {
        const id = this.getCachedId(symbol, type)
        const coin = this.coins.get(id)
        if (!coin) return false

        const prevState = coin.collectState
        if (prevState === newState) return true

        this.stateIndex.get(prevState)?.delete(id)
        this.stateIndex.get(newState)?.add(id)

        if (prevState === "SUBSCRIBED") this.activeCoinsCount--
        if (newState === "SUBSCRIBED") this.activeCoinsCount++

        coin.collectState = newState
        coin.lastStateChange = this.getCurrentTimestamp()
        coin.stateChangeCount++

        return true
    }

    public updateOrderBook(
        symbol: string,
        type: string,
        source: OrderBook
    ): boolean {
        const coin = this.coins.get(this.getCachedId(symbol, type))
        if (!coin || coin.collectState !== "SUBSCRIBED") return false

        if (
            coin.orderBook &&
            coin.orderBook.lastUpdateId >= source.lastUpdateId
        ) {
            coin.outOfSequenceCount++
            return false
        }

        if (!coin.orderBook) {
            coin.orderBook = this.orderBookPool.pop() || {
                lastUpdateId: source.lastUpdateId,
                timestamp: source.timestamp,
                bids: [],
                asks: [],
            }
        } else {
            coin.orderBook = {
                lastUpdateId: source.lastUpdateId,
                timestamp: source.timestamp,
                bids: coin.orderBook.bids,
                asks: coin.orderBook.asks,
            }
        }

        const target = coin.orderBook
        target.bids.length = 0
        target.asks.length = 0

        const maxLevels = coin.maxOrderBookLevels
        for (let i = 0; i < maxLevels && i < source.bids.length; i++) {
            target.bids.push(source.bids[i])
        }
        for (let i = 0; i < maxLevels && i < source.asks.length; i++) {
            target.asks.push(source.asks[i])
        }

        const now = this.getCurrentTimestamp()
        coin.updateCount++
        coin.lastUpdateTime = now
        coin.avgUpdateInterval =
            coin.avgUpdateInterval * 0.9 + (now - coin.lastUpdateTime) * 0.1

        queueMicrotask(() => this.metrics.recordUpdate())
        return true
    }

    public recordError(symbol: string, type: string, error: string): boolean {
        const coin = this.coins.get(this.getCachedId(symbol, type))
        if (!coin) return false

        coin.errorCount++
        coin.lastErrorTime = this.getCurrentTimestamp()
        coin.lastErrorMessage = error
        queueMicrotask(() => this.metrics.recordError())

        return true
    }

    public getCoinsByMarketType(type: string): CoinInfo[] {
        const result: CoinInfo[] = []
        for (const coin of this.coins.values()) {
            if (coin.type === type) {
                result.push(coin)
            }
        }
        return result
    }

    public getCoinsByCollectState(state: CollectState): CoinInfo[] {
        const coins = this.stateIndex.get(state)
        if (!coins) return []

        const result: CoinInfo[] = []
        for (const id of coins) {
            const coin = this.coins.get(id)
            if (coin) result.push(coin)
        }
        return result
    }

    public getExchangeName(): string {
        return this.exchangeName
    }

    public getMetrics(): Readonly<RegistryMetrics> {
        return this.metrics.getMetrics(
            this.coins.size,
            this.activeCoinsCount,
            this.tradableCoinsCount
        )
    }

    private getCachedId(symbol: string, type: string): string {
        const key = `${symbol}:${type}`
        let id = this.symbolTypeCache.get(key)
        if (!id) {
            id = `${symbol}_${type}`
            this.symbolTypeCache.set(key, id)
        }
        return id
    }

    private getCurrentTimestamp(): number {
        const now = Date.now()
        this.lastTimestamp = now
        return now
    }
}
