import WebSocket, { RawData } from "ws";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BinanceDataTransformer } from "./BinanceDataTransformer";
import { EventEmitter } from "events";

export class BinanceWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;
    private requestId: number;
    private pingTimer: NodeJS.Timeout | null;
    private connectionTimeoutTimer: NodeJS.Timeout | null;

    constructor() {
        super();
        this.baseUrl = "wss://fstream.binance.com/ws";
        this.ws = null;
        this.requestId = 1;
        this.pingTimer = null;
        this.connectionTimeoutTimer = null;
    }

    public connect(): void {
        if (this.ws) {
            console.log(
                "Closing existing WebSocket connection before reconnecting."
            );
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
            console.log("Disconnecting Binance WebSocket...");
            this.ws.close();
            this.ws = null;
        }
        this.stopPingPong();
        this.clearConnectionTimeout();
    }

    public subscribe(streams: string[]): void {
        const payload = {
            method: "SUBSCRIBE",
            params: streams,
            id: this.getNextRequestId(),
        };
        this.send(payload);
        console.log(`Binance: Subscribed to streams: ${streams.join(", ")}`);
    }

    public unsubscribe(streams: string[]): void {
        const payload = {
            method: "UNSUBSCRIBE",
            params: streams,
            id: this.getNextRequestId(),
        };
        this.send(payload);
        console.log(
            `Binance: Unsubscribed from streams: ${streams.join(", ")}`
        );
    }

    public listSubscriptions(): void {
        const payload = {
            method: "LIST_SUBSCRIPTIONS",
            id: 999,
        };
        this.send(payload);
        console.log("Binance: Requested list of active subscriptions.");
    }

    public connectAndSubscribe(streams: string[]): void {
        this.connect(); // WebSocket 연결
        this.ws?.once("open", () => {
            // 연결이 열리면 구독 요청
            if (streams.length > 0) {
                this.subscribe(streams);
            }
        });
    }
    public disconnectUunsubscribe(streams: string[]): void {
        const payload = {
            method: "UNSUBSCRIBE",
            params: streams,
            id: this.getNextRequestId(),
        };
        this.send(payload);
        setTimeout(() => {
            this.disconnect();
        }, 1000); // 1초 대기 후 연결 종료
        console.log(
            `Binance: Unsubscribed from streams: ${streams.join(", ")}`
        );
    }
    private handleOpen(): void {
        console.log("Binance WebSocket connection established.");
        this.startPingPong();
        this.startConnectionTimeout();
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message.id) {
                if (message.id === 999) {
                    console.log(
                        "Binance: Active subscriptions:",
                        message.result
                    );
                } else {
                    console.log("Binance: Unsupported message type:", message);
                }
            } else if (message?.s && message?.b && message?.a) {
                const standardizedData =
                    BinanceDataTransformer.transformToStandardFormat(message);
                this.emit("orderbook", standardizedData); // 표준화된 데이터 이벤트 발생
            } else {
                console.log("Binance: Received Data:", message);
            }
        } catch (error) {
            console.error("Binance: Failed to parse message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Binance WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Binance WebSocket connection closed.");
        this.stopPingPong();
        this.clearConnectionTimeout();
    }

    private startPingPong(): void {
        this.stopPingPong();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping();
                console.log("Binance: Ping frame sent to maintain connection.");
            }
        }, 3 * 60 * 1000);
    }

    private stopPingPong(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
            console.log("Binance: Ping-Pong timer stopped.");
        }
    }

    private startConnectionTimeout(): void {
        this.clearConnectionTimeout();
        this.connectionTimeoutTimer = setTimeout(() => {
            console.log("Binance: 24시간이 경과하여 WebSocket 연결 종료.");
            this.disconnect();
        }, 24 * 60 * 60 * 1000);
    }

    private clearConnectionTimeout(): void {
        if (this.connectionTimeoutTimer) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }
    }

    private send(payload: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error("Binance WebSocket is not connected.");
        }
    }

    private getNextRequestId(): number {
        return this.requestId++;
    }
}
