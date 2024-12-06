/**
 * Path: src/exchanges/upbit/orderbook/UpbitOrderBookManager.ts
 * 업비트 OrderBook 관리
 */
import {
    OrderBookManager,
    OrderBookLevel,
    OrderBookSnapshot,
    OrderBookUpdate,
} from "../../common/orderbook/types"

export class UpbitOrderBookManager implements OrderBookManager {
    private orderBooks = new Map<string, OrderBookSnapshot>()

    updateOrderBook(symbol: string, update: OrderBookUpdate): void {
        const currentBook = this.orderBooks.get(symbol)

        if (!currentBook) {
            // 새로운 OrderBook 생성
            this.orderBooks.set(symbol, {
                symbol,
                lastUpdateId: update.sequence,
                asks: update.asks,
                bids: update.bids,
                timestamp: update.timestamp,
            })
            return
        }

        // 데이터 업데이트가 순차적인지 확인
        if (update.sequence <= currentBook.lastUpdateId) {
            return // 이전 시퀀스의 데이터는 무시
        }

        // OrderBook 업데이트
        this.updatePriceLevels(currentBook, update)
    }

    private updatePriceLevels(
        book: OrderBookSnapshot,
        update: OrderBookUpdate
    ): void {
        // asks 업데이트
        book.asks = this.mergePriceLevels(book.asks, update.asks)
        // bids 업데이트
        book.bids = this.mergePriceLevels(book.bids, update.bids)

        book.lastUpdateId = update.sequence
        book.timestamp = update.timestamp
    }

    private mergePriceLevels(
        current: OrderBookLevel[],
        updates: OrderBookLevel[]
    ): OrderBookLevel[] {
        const priceMap = new Map<number, OrderBookLevel>()

        // 현재 호가 맵핑
        current.forEach((level) => {
            priceMap.set(level.price, level)
        })

        // 업데이트 적용
        updates.forEach((update) => {
            if (update.quantity === 0) {
                priceMap.delete(update.price)
            } else {
                priceMap.set(update.price, update)
            }
        })

        // asks는 가격 오름차순, bids는 가격 내림차순 정렬
        return Array.from(priceMap.values()).sort((a, b) => a.price - b.price)
    }

    getOrderBook(symbol: string): OrderBookSnapshot | undefined {
        return this.orderBooks.get(symbol)
    }

    clear(): void {
        this.orderBooks.clear()
    }
}
