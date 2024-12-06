/**
 * Path: src/exchanges/binance/orderbook/BinanceOrderBookManager.ts
 * 바이낸스 OrderBook 관리
 */
import {
    OrderBookManager,
    OrderBookLevel,
    OrderBookSnapshot,
    OrderBookUpdate,
} from "../../common/orderbook/types"

export class BinanceOrderBookManager implements OrderBookManager {
    private orderBooks = new Map<string, OrderBookSnapshot>()
    private readonly MAX_LEVELS = 1000

    updateOrderBook(symbol: string, update: OrderBookUpdate): void {
        const currentBook = this.orderBooks.get(symbol)

        if (!currentBook) {
            this.createNewOrderBook(symbol, update)
            return
        }

        if (update.firstUpdateId <= currentBook.lastUpdateId) {
            return // 이전 업데이트는 무시
        }

        this.applyUpdate(currentBook, update)
    }

    private createNewOrderBook(symbol: string, update: OrderBookUpdate): void {
        this.orderBooks.set(symbol, {
            symbol,
            lastUpdateId: update.finalUpdateId,
            asks: this.sortLevels(update.asks, "ASK"),
            bids: this.sortLevels(update.bids, "BID"),
            timestamp: update.timestamp,
        })
    }

    private applyUpdate(
        book: OrderBookSnapshot,
        update: OrderBookUpdate
    ): void {
        book.asks = this.sortLevels(
            this.mergePriceLevels(book.asks, update.asks),
            "ASK"
        )
        book.bids = this.sortLevels(
            this.mergePriceLevels(book.bids, update.bids),
            "BID"
        )

        book.lastUpdateId = update.finalUpdateId
        book.timestamp = update.timestamp
    }

    private mergePriceLevels(
        current: OrderBookLevel[],
        updates: OrderBookLevel[]
    ): OrderBookLevel[] {
        const priceMap = new Map<number, OrderBookLevel>()

        current.forEach((level) => priceMap.set(level.price, level))

        updates.forEach((update) => {
            if (update.quantity === 0) {
                priceMap.delete(update.price)
            } else {
                priceMap.set(update.price, update)
            }
        })

        return Array.from(priceMap.values()).slice(0, this.MAX_LEVELS)
    }

    private sortLevels(
        levels: OrderBookLevel[],
        side: "ASK" | "BID"
    ): OrderBookLevel[] {
        return levels.sort((a, b) =>
            side === "ASK" ? a.price - b.price : b.price - a.price
        )
    }

    getOrderBook(symbol: string): OrderBookSnapshot | undefined {
        return this.orderBooks.get(symbol)
    }

    handleSnapshot(symbol: string, snapshot: OrderBookSnapshot): void {
        this.orderBooks.set(symbol, {
            ...snapshot,
            asks: this.sortLevels(snapshot.asks, "ASK"),
            bids: this.sortLevels(snapshot.bids, "BID"),
        })
    }

    clear(): void {
        this.orderBooks.clear()
    }
}
