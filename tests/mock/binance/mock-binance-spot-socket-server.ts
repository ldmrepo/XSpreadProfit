/**
 * src/mock/binance/mock-binance-spot-socket-server.ts
 *
 * Binance Spot WebSocket Server - Partial Book Depth Streams
 * - 호가창의 상위 N개 데이터 스트림 제공
 * - 1초 또는 100ms 간격 업데이트
 */

import WebSocket, { WebSocketServer } from "ws";
import { EventEmitter } from "events";

interface DepthStreamData {
    lastUpdateId: number;
    bids: [string, string][]; // [price, quantity][]
    asks: [string, string][]; // [price, quantity][]
}

interface Subscription {
    client: WebSocket;
    symbol: string;
    stream: string;
}

export class BinanceSpotDepthStream extends EventEmitter {
    private wss: WebSocketServer;
    private subscriptions: Map<string, Set<Subscription>>;
    private basePrice: Map<string, number>;
    private updateIntervals: Map<string, NodeJS.Timeout>;

    constructor(port: number) {
        super();
        this.wss = new WebSocketServer({ port });
        this.subscriptions = new Map();
        this.basePrice = new Map();
        this.updateIntervals = new Map();

        this.initializeServer();
    }

    private initializeServer() {
        this.wss.on("connection", (ws) => {
            console.log("Client connected");

            ws.on("message", (message) =>
                this.handleMessage(ws, message.toString())
            );
            ws.on("close", () => this.handleDisconnection(ws));
            ws.on("error", (error) => this.handleError(ws, error));
        });
    }

    private handleMessage(ws: WebSocket, message: string) {
        try {
            const data = JSON.parse(message);

            if (data.method === "SUBSCRIBE") {
                this.handleSubscribe(ws, data);
            } else if (data.method === "UNSUBSCRIBE") {
                this.handleUnsubscribe(ws, data);
            }
        } catch (error) {
            this.sendError(ws, "Invalid message format");
        }
    }

    private handleSubscribe(ws: WebSocket, data: any) {
        data.params.forEach((param: string) => {
            // 형식: <symbol>@depth<levels>[@100ms]
            const matches = param.match(/^(.+)@depth(\d+)(?:@100ms)?$/);
            if (!matches) {
                this.sendError(ws, `Invalid stream name: ${param}`);
                return;
            }

            const [_, symbol, levelsStr] = matches;
            const levels = parseInt(levelsStr);
            const is100ms = param.includes("@100ms");

            // 레벨 검증
            if (![5, 10, 20].includes(levels)) {
                this.sendError(ws, `Invalid depth level: ${levels}`);
                return;
            }

            this.subscribeToStream(ws, symbol, levels, is100ms);
        });

        // 구독 응답
        ws.send(
            JSON.stringify({
                result: null,
                id: data.id,
            })
        );
    }

    private subscribeToStream(
        ws: WebSocket,
        symbol: string,
        levels: number,
        is100ms: boolean
    ) {
        const streamName = `${symbol.toLowerCase()}@depth${levels}${
            is100ms ? "@100ms" : ""
        }`;
        const interval = is100ms ? 100 : 1000;

        // 초기 가격 설정
        if (!this.basePrice.has(symbol)) {
            this.basePrice.set(symbol, this.getInitialPrice(symbol));
        }

        // 구독 추가
        if (!this.subscriptions.has(streamName)) {
            this.subscriptions.set(streamName, new Set());
        }

        const subscription: Subscription = {
            client: ws,
            symbol,
            stream: streamName,
        };
        this.subscriptions.get(streamName)!.add(subscription);

        // 스트림 시작
        if (!this.updateIntervals.has(streamName)) {
            const intervalId = setInterval(() => {
                const data = this.generateDepthData(symbol, levels);
                this.broadcast(streamName, data);
            }, interval);
            this.updateIntervals.set(streamName, intervalId);
        }
    }

    private generateDepthData(symbol: string, levels: number): DepthStreamData {
        const basePrice = this.basePrice.get(symbol)!;

        // 가격 변동 시뮬레이션
        const priceChange = (Math.random() - 0.5) * 0.0002 * basePrice;
        this.basePrice.set(symbol, basePrice + priceChange);

        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        for (let i = 0; i < levels; i++) {
            // 매수 호가
            const bidPrice = (basePrice - i * 0.0001 * basePrice).toFixed(8);
            const bidQty = (Math.random() * 100).toFixed(8);
            bids.push([bidPrice, bidQty]);

            // 매도 호가
            const askPrice = (basePrice + i * 0.0001 * basePrice).toFixed(8);
            const askQty = (Math.random() * 100).toFixed(8);
            asks.push([askPrice, askQty]);
        }

        return {
            lastUpdateId: Date.now(),
            bids,
            asks,
        };
    }

    private broadcast(streamName: string, data: any) {
        const subs = this.subscriptions.get(streamName);
        if (!subs) return;

        const message = JSON.stringify({
            stream: streamName,
            data: data,
        });

        subs.forEach((sub) => {
            try {
                if (sub.client.readyState === WebSocket.OPEN) {
                    sub.client.send(message);
                }
            } catch (error) {
                console.error(`Failed to send message to client: ${error}`);
            }
        });
    }

    private handleUnsubscribe(ws: WebSocket, data: any) {
        data.params.forEach((param: string) => {
            this.unsubscribeFromStream(ws, param);
        });

        ws.send(
            JSON.stringify({
                result: null,
                id: data.id,
            })
        );
    }

    private unsubscribeFromStream(ws: WebSocket, streamName: string) {
        const subs = this.subscriptions.get(streamName);
        if (!subs) return;

        // 구독 제거
        subs.forEach((sub) => {
            if (sub.client === ws) {
                subs.delete(sub);
            }
        });

        // 구독자가 없으면 인터벌 정리
        if (subs.size === 0) {
            const intervalId = this.updateIntervals.get(streamName);
            if (intervalId) {
                clearInterval(intervalId);
                this.updateIntervals.delete(streamName);
            }
            this.subscriptions.delete(streamName);
        }
    }

    private handleDisconnection(ws: WebSocket) {
        // 모든 구독에서 클라이언트 제거
        this.subscriptions.forEach((subs, streamName) => {
            this.unsubscribeFromStream(ws, streamName);
        });
    }

    private getInitialPrice(symbol: string): number {
        // 심볼별 초기 가격
        switch (symbol.toUpperCase()) {
            case "BTCUSDT":
                return 40000;
            case "ETHUSDT":
                return 2000;
            case "BNBUSDT":
                return 300;
            default:
                return 100;
        }
    }

    private sendError(ws: WebSocket, message: string) {
        ws.send(
            JSON.stringify({
                error: {
                    code: -1,
                    msg: message,
                },
            })
        );
    }

    private handleError(ws: WebSocket, error: Error) {
        console.error("WebSocket error:", error);
        this.handleDisconnection(ws);
    }

    // 서버 종료
    public close() {
        this.updateIntervals.forEach((interval) => clearInterval(interval));
        this.wss.close();
    }
}

// 서버 시작
const server = new BinanceSpotDepthStream(8080);
