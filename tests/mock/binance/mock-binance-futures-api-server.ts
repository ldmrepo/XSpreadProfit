/**
 * src/mock/binance/mock-binance-futures-api-server.ts
 *
 * Futures REST API - Order Book Endpoint
 * - GET /fapi/v1/depth
 * - 제한된 limit 값만 허용
 * - 거래소 특화 타임스탬프 포함
 */

import express from "express";
import { Request, Response } from "express";
import { Server } from "http";

interface FuturesOrderBookData {
    lastUpdateId: number;
    E: number; // Message output time
    T: number; // Transaction time
    bids: [string, string][];
    asks: [string, string][];
}

export class MockBinanceFuturesApiServer {
    private app: express.Application;
    private server: Server | null = null;
    private orderBooks: Map<string, FuturesOrderBookData>;
    private readonly VALID_LIMITS = [5, 10, 20, 50, 100, 500, 1000];

    constructor() {
        this.app = express();
        this.orderBooks = new Map();
        this.setupRestServer();
    }

    private setupRestServer(): void {
        this.app.get("/fapi/v1/depth", (req: any, res: any) => {
            try {
                const symbol = req.query.symbol?.toString().toUpperCase();
                const limit = parseInt(req.query.limit?.toString() || "500");

                if (!symbol) {
                    return res.status(400).json({
                        code: -1100,
                        msg: "Mandatory parameter 'symbol' was not sent",
                    });
                }

                if (!this.VALID_LIMITS.includes(limit)) {
                    return res.status(400).json({
                        code: -1100,
                        msg: `Invalid limit value. Valid values: ${this.VALID_LIMITS.join(
                            ", "
                        )}`,
                    });
                }

                const orderBook = this.getOrderBookData(symbol, limit);

                return res.json(orderBook);
            } catch (error) {
                return res.status(500).json({
                    code: -1000,
                    msg: "Internal server error",
                });
            }
        });
    }
    public listen(port: number): Server {
        this.server = this.app.listen(port);
        return this.server;
    }
    private calculateWeight(limit: number): number {
        if (limit <= 50) return 2;
        if (limit <= 100) return 5;
        if (limit <= 500) return 10;
        return 20;
    }

    private getOrderBookData(
        symbol: string,
        limit: number
    ): FuturesOrderBookData {
        // 캐시된 데이터가 있으면 반환
        if (this.orderBooks.has(symbol)) {
            const cached = this.orderBooks.get(symbol)!;
            return {
                ...cached,
                bids: cached.bids.slice(0, limit),
                asks: cached.asks.slice(0, limit),
            };
        }

        // 새로운 호가 데이터 생성
        const basePrice = this.getInitialPrice(symbol);
        const orderBook = this.generateOrderBook(symbol, basePrice, limit);
        this.orderBooks.set(symbol, orderBook);

        return orderBook;
    }

    private generateOrderBook(
        symbol: string,
        basePrice: number,
        limit: number
    ): FuturesOrderBookData {
        const now = Date.now();
        const transactionTime = now - Math.floor(Math.random() * 10); // 약간의 지연 시뮬레이션

        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        // 선물 시장의 높은 레버리지를 고려한 큰 수량
        for (let i = 0; i < limit; i++) {
            // 선물 시장의 특성을 반영한 더 큰 스프레드
            const spreadMultiplier = 0.02; // 현물보다 더 큰 스프레드

            // BID
            const bidPrice = (basePrice - i * spreadMultiplier).toFixed(8);
            const bidQty = (Math.random() * 10000).toFixed(8); // 더 큰 수량
            bids.push([bidPrice, bidQty]);

            // ASK
            const askPrice = (basePrice + i * spreadMultiplier).toFixed(8);
            const askQty = (Math.random() * 10000).toFixed(8);
            asks.push([askPrice, askQty]);
        }

        return {
            lastUpdateId: Date.now(),
            E: now, // Message output time
            T: transactionTime, // Transaction time
            bids: bids,
            asks: asks,
        };
    }

    private getInitialPrice(symbol: string): number {
        // 심볼별 적절한 초기 가격 설정
        switch (symbol) {
            case "BTCUSDT":
                return 40000 + Math.random() * 1000;
            case "ETHUSDT":
                return 2000 + Math.random() * 100;
            case "BNBUSDT":
                return 200 + Math.random() * 10;
            default:
                return 100 + Math.random() * 10;
        }
    }

    // 주기적 업데이트 (선물 시장의 더 빠른 가격 변동 반영)
    private startOrderBookUpdates() {
        setInterval(() => {
            this.orderBooks.forEach((book, symbol) => {
                const currentPrice = parseFloat(book.bids[0][0]);
                // 선물 시장의 더 큰 변동성 반영
                const priceChange =
                    (Math.random() - 0.5) * 0.005 * currentPrice;
                const newPrice = currentPrice + priceChange;

                const newBook = this.generateOrderBook(symbol, newPrice, 1000);
                this.orderBooks.set(symbol, newBook);
            });
        }, 500); // 현물보다 더 빠른 업데이트
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

// 서버 시작 (HTTP: 3001, WebSocket: 8081 - 현물과 다른 포트 사용)
// const server = new MockBinanceFuturesApiServer(3001, 8081);
