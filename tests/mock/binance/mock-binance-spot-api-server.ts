/**
 * src/mock/binance/mock-binance-spot-api-server.ts
 *
 * REST API - Order Book Endpoint
 * - GET /api/v3/depth
 * - 다양한 깊이의 호가 데이터 제공
 * - 요청 가중치 관리
 */

import express from "express";
import { Request, Response } from "express";
import { Server } from "http";

interface OrderBookData {
    lastUpdateId: number;
    bids: [string, string][];
    asks: [string, string][];
}

export class MockBinanceSpotApiServer {
    private app: express.Application;
    private server: Server | null = null;
    private orderBooks: Map<string, OrderBookData>;

    constructor() {
        // REST 서버 설정
        this.app = express();
        this.orderBooks = new Map();
        this.setupRestServer();
    }

    private setupRestServer() {
        // Order Book 엔드포인트
        this.app.get("/api/v3/depth", (req: any, res: any) => {
            try {
                const symbol = req.query.symbol?.toString().toUpperCase();
                const limit = parseInt(req.query.limit?.toString() || "100");

                // 파라미터 검증
                if (!symbol) {
                    return res.status(400).json({
                        code: -1100,
                        msg: "Illegal characters found in parameter 'symbol'",
                    });
                }

                // limit 검증
                if (isNaN(limit) || limit < 1 || limit > 5000) {
                    return res.status(400).json({
                        code: -1100,
                        msg: "Illegal characters found in parameter 'limit'",
                    });
                }

                // Weight 체크 및 적용
                const weight = this.calculateWeight(limit);
                // rate limiter 로직 구현 가능

                // 호가 데이터 생성 또는 조회
                const orderBook = this.getOrderBookData(symbol, limit);

                res.json(orderBook);
            } catch (error) {
                res.status(500).json({
                    code: -1000,
                    msg: "An unknown error occurred while processing the request",
                });
            }
        });
    }
    public listen(port: number): Server {
        this.server = this.app.listen(port, () => {
            console.log(`REST API server running on port ${port}`);
        });
        return this.server!;
    }
    private calculateWeight(limit: number): number {
        if (limit <= 100) return 1;
        if (limit <= 500) return 5;
        if (limit <= 1000) return 10;
        if (limit <= 5000) return 50;
        return 50;
    }

    private getOrderBookData(symbol: string, limit: number): OrderBookData {
        // 캐시된 데이터가 있으면 반환
        if (this.orderBooks.has(symbol)) {
            const cached = this.orderBooks.get(symbol)!;
            return {
                lastUpdateId: cached.lastUpdateId,
                bids: cached.bids.slice(0, limit),
                asks: cached.asks.slice(0, limit),
            };
        }

        // 새로운 호가 데이터 생성
        const basePrice = 100 + Math.random() * 1000;
        const orderBook = this.generateOrderBook(basePrice, limit);
        this.orderBooks.set(symbol, orderBook);

        return orderBook;
    }

    private generateOrderBook(basePrice: number, limit: number): OrderBookData {
        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        for (let i = 0; i < limit; i++) {
            // BID: 기준가격보다 낮은 가격
            const bidPrice = (basePrice - i * 0.01).toFixed(8);
            const bidQty = (Math.random() * 1000).toFixed(8);
            bids.push([bidPrice, bidQty]);

            // ASK: 기준가격보다 높은 가격
            const askPrice = (basePrice + i * 0.01).toFixed(8);
            const askQty = (Math.random() * 1000).toFixed(8);
            asks.push([askPrice, askQty]);
        }

        return {
            lastUpdateId: Date.now(),
            bids: bids,
            asks: asks,
        };
    }

    // 주기적으로 호가 데이터 업데이트
    private startOrderBookUpdates() {
        setInterval(() => {
            this.orderBooks.forEach((book, symbol) => {
                const basePrice = parseFloat(book.bids[0][0]);
                const newBook = this.generateOrderBook(basePrice, 5000);
                this.orderBooks.set(symbol, newBook);
            });
        }, 1000);
    }

    public close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.server = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

// 서버 시작 (HTTP: 3000, WebSocket: 8080)
// const server = new MockBinanceSpotApiServer(3000, 8080);
