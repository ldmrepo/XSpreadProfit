/**
 * Path: src/exchanges/common/orderbook/OrderBookManager.ts
 * OrderBook 관리 클래스
 */

import { OrderBookLevel, OrderBookSnapshot, OrderBookUpdate } from "./types"

export class OrderBookManager {
    private orderBooks = new Map<string, OrderBookSnapshot>()

    updateOrderBook(symbol: string, update: OrderBookUpdate): void {
        const currentBook = this.orderBooks.get(symbol)

        if (!currentBook) {
            // 새로운 OrderBook 생성
            this.orderBooks.set(symbol, {
                symbol,
                lastUpdateId: update.finalUpdateId,
                bids: update.bids,
                asks: update.asks,
                timestamp: update.timestamp,
            })
            return
        }

        // OrderBook 업데이트
        this.applyUpdate(currentBook, update)
    }

    private applyUpdate(
        book: OrderBookSnapshot,
        update: OrderBookUpdate
    ): void {
        if (update.firstUpdateId <= book.lastUpdateId) {
            return // 이미 적용된 업데이트
        }

        // 호가 업데이트 적용
        book.bids = this.updatePriceLevels(book.bids, update.bids)
        book.asks = this.updatePriceLevels(book.asks, update.asks)
        book.lastUpdateId = update.finalUpdateId
        book.timestamp = update.timestamp
    }

    private updatePriceLevels(
        current: OrderBookLevel[],
        updates: OrderBookLevel[]
    ): OrderBookLevel[] {
        // 가격 레벨 업데이트 로직
        const merged = new Map(current.map((level) => [level.price, level]))

        updates.forEach((update) => {
            if (update.quantity === 0) {
                merged.delete(update.price)
            } else {
                merged.set(update.price, update)
            }
        })

        return Array.from(merged.values()).sort((a, b) => b.price - a.price)
    }

    getOrderBook(symbol: string): OrderBookSnapshot | undefined {
        return this.orderBooks.get(symbol)
    }
}
