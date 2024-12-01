import WebSocket, { RawData } from "ws";
import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BybitFuturesDataTransformer } from "./BybitFuturesDataTransformer";

export class BybitFuturesWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;
    private pingInterval: NodeJS.Timeout | null;
    private reconnectInterval: NodeJS.Timeout | null;

    constructor() {
        super();
        this.baseUrl = "wss://stream.bybit.com/v5/public/linear"; // Bybit 선물 WebSocket URL
        this.ws = null;
        this.pingInterval = null;
        this.reconnectInterval = null;
    }

    public connect(): void {
        if (this.ws) {
            this.disconnect();
        }

        this.ws = new WebSocket(this.baseUrl);

        this.ws.on("open", () => this.handleOpen());
        this.ws.on("message", (data) => this.handleMessage(data));
        this.ws.on("error", (error) => this.handleError(error));
        this.ws.on("close", () => this.handleClose());
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.stopPing();
        this.stopReconnect();
    }

    public subscribe(topics: string[]): void {
        const payload = {
            op: "subscribe",
            args: topics,
        };
        this.send(payload);
        console.log(
            `Bybit Futures: Subscribed to topics: ${topics.join(", ")}`
        );
    }

    public unsubscribe(topics: string[]): void {
        const payload = {
            op: "unsubscribe",
            args: topics,
        };
        this.send(payload);
        console.log(
            `Bybit Futures: Unsubscribed from topics: ${topics.join(", ")}`
        );
    }

    public listSubscriptions(): void {
        // Bybit의 WebSocket API는 활성 구독 목록을 제공하지 않습니다.
        console.log("Bybit Futures: Listing subscriptions is not supported.");
    }

    public connectAndSubscribe(topics: string[]): void {
        this.connect();
        this.once("open", () => {
            if (topics.length > 0) {
                this.subscribe(topics);
            }
        });
    }

    public disconnectUunsubscribe(topics: string[]): void {
        this.unsubscribe(topics);
        setTimeout(() => {
            this.disconnect();
        }, 1000);
    }

    private handleOpen(): void {
        console.log("Bybit Futures WebSocket connection established.");
        this.startPing();
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message.topic && message.data) {
                const standardizedData =
                    BybitFuturesDataTransformer.transformToStandardFormat(
                        message.data
                    );
                this.emit("data", standardizedData);
            } else {
                console.log("Bybit Futures: Received message:", message);
            }
        } catch (error) {
            console.error("Bybit Futures: Failed to parse message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Bybit Futures WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Bybit Futures WebSocket connection closed.");
        this.stopPing();
        this.scheduleReconnect();
    }

    private startPing(): void {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                const pingPayload = {
                    op: "ping",
                };
                this.send(pingPayload);
                console.log("Bybit Futures: Ping sent to maintain connection.");
            }
        }, 20 * 1000); // 20초마다 핑 전송
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log("Bybit Futures: Ping interval cleared.");
        }
    }

    private scheduleReconnect(): void {
        this.stopReconnect();
        this.reconnectInterval = setTimeout(() => {
            console.log("Bybit Futures: Attempting to reconnect...");
            this.connect();
        }, 5000); // 5초 후 재연결 시도
    }

    private stopReconnect(): void {
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
            console.log("Bybit Futures: Reconnect interval cleared.");
        }
    }

    private send(payload: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error("Bybit Futures WebSocket is not connected.");
        }
    }
}
