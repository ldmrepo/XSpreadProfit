/**
 * src/mock/binance/mock-binance-futures-socket-server.ts
 *
 * Binance Futures WebSocket Server - Partial Book Depth Streams
 * - 호가창의 상위 N개 데이터 스트림 제공
 * - 250ms, 500ms, 100ms 간격 업데이트
 */

import WebSocket, { WebSocketServer } from "ws";
import { EventEmitter } from "events";

interface FuturesDepthStreamData {
    e: string; // Event type
    E: number; // Event time
    T: number; // Transaction time
    s: string; // Symbol
    U: number; // First update ID
    u: number; // Final update ID
    pu: number; // Previous final update ID
    b: [string, string][]; // Bids
    a: [string, string][]; // Asks
}

interface Subscription {
    client: WebSocket;
    symbol: string;
    stream: string;
    lastUpdateId: number;
}

export class BinanceFuturesDepthStream extends EventEmitter {
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
            console.log("Futures client connected");
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
            // 형식: <symbol>@depth<levels>[@100ms|@500ms]
            const matches = param.match(/^(.+)@depth(\d+)(?:@(\d+)ms)?$/);
            if (!matches) {
                this.sendError(ws, `Invalid stream name: ${param}`);
                return;
            }

            const [_, symbol, levelsStr, speedStr] = matches;
            const levels = parseInt(levelsStr);
            const updateSpeed = speedStr ? parseInt(speedStr) : 250; // 기본값 250ms

            // 유효성 검증
            if (![5, 10, 20].includes(levels)) {
                this.sendError(ws, `Invalid depth level: ${levels}`);
                return;
            }

            if (![100, 250, 500].includes(updateSpeed)) {
                this.sendError(ws, `Invalid update speed: ${updateSpeed}`);
                return;
            }

            this.subscribeToStream(ws, symbol, levels, updateSpeed);
        });

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
        updateSpeed: number
    ) {
        const streamName = `${symbol.toLowerCase()}@depth${levels}${
            updateSpeed !== 250 ? `@${updateSpeed}ms` : ""
        }`;

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
            lastUpdateId: Math.floor(Math.random() * 1000000),
        };

        this.subscriptions.get(streamName)!.add(subscription);

        // 스트림 시작
        if (!this.updateIntervals.has(streamName)) {
            const intervalId = setInterval(() => {
                const data = this.generateDepthData(
                    symbol,
                    levels,
                    subscription
                );
                this.broadcast(streamName, data);
            }, updateSpeed);
            this.updateIntervals.set(streamName, intervalId);
        }
    }

    private generateDepthData(
        symbol: string,
        levels: number,
        subscription: Subscription
    ): FuturesDepthStreamData {
        const basePrice = this.basePrice.get(symbol)!;
        const now = Date.now();

        // 가격 변동 시뮬레이션 (선물 시장의 큰 변동성 반영)
        const priceChange = (Math.random() - 0.5) * 0.001 * basePrice;
        this.basePrice.set(symbol, basePrice + priceChange);

        // 업데이트 ID 관리
        const prevUpdateId = subscription.lastUpdateId;
        subscription.lastUpdateId += Math.floor(Math.random() * 100);

        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        for (let i = 0; i < levels; i++) {
            // 선물 시장의 큰 스프레드 반영
            const bidPrice = (basePrice - i * 0.1).toFixed(2);
            const bidQty = (Math.random() * 10).toFixed(3);
            bids.push([bidPrice, bidQty]);

            const askPrice = (basePrice + i * 0.1).toFixed(2);
            const askQty = (Math.random() * 10).toFixed(3);
            asks.push([askPrice, askQty]);
        }

        return {
            e: "depthUpdate",
            E: now,
            T: now - 1, // 약간의 지연 시뮬레이션
            s: symbol.toUpperCase(),
            U: prevUpdateId + 1,
            u: subscription.lastUpdateId,
            pu: prevUpdateId,
            b: bids,
            a: asks,
        };
    }

    private broadcast(streamName: string, data: FuturesDepthStreamData) {
        const subs = this.subscriptions.get(streamName);
        if (!subs) return;

        const message = JSON.stringify({
            stream: streamName,
            data: data,
        });

        subs.forEach((sub) => {
            if (sub.client.readyState === WebSocket.OPEN) {
                sub.client.send(message);
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

        subs.forEach((sub) => {
            if (sub.client === ws) {
                subs.delete(sub);
            }
        });

        if (subs.size === 0) {
            const intervalId = this.updateIntervals.get(streamName);
            if (intervalId) {
                clearInterval(intervalId);
                this.updateIntervals.delete(streamName);
            }
            this.subscriptions.delete(streamName);
        }
    }

    private getInitialPrice(symbol: string): number {
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

    private handleDisconnection(ws: WebSocket) {
        this.subscriptions.forEach((subs, streamName) => {
            this.unsubscribeFromStream(ws, streamName);
        });
    }

    private handleError(ws: WebSocket, error: Error) {
        console.error("WebSocket error:", error);
        this.handleDisconnection(ws);
    }

    public close() {
        this.updateIntervals.forEach((interval) => clearInterval(interval));
        this.wss.close();
    }
}

// 서버 시작 (선물용 별도 포트)
const server = new BinanceFuturesDepthStream(8081);
