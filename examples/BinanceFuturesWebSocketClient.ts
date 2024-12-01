import WebSocket, { RawData } from "ws";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BinanceFuturesDataTransformer } from "./BinanceFuturesDataTransformer";
import { EventEmitter } from "events";

export class BinanceFuturesWebSocketClient
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
        this.baseUrl = "wss://fstream.binance.com/ws"; // Binance Futures WebSocket URL
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
            console.log("Disconnecting Binance Futures WebSocket...");
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
        console.log(
            `Binance Futures: Subscribed to streams: ${streams.join(", ")}`
        );
    }

    public unsubscribe(streams: string[]): void {
        const payload = {
            method: "UNSUBSCRIBE",
            params: streams,
            id: this.getNextRequestId(),
        };
        this.send(payload);
        console.log(
            `Binance Futures: Unsubscribed from streams: ${streams.join(", ")}`
        );
    }

    public listSubscriptions(): void {
        const payload = {
            method: "LIST_SUBSCRIPTIONS",
            id: 999,
        };
        this.send(payload);
        console.log("Binance Futures: Requested list of active subscriptions.");
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
            `Binance Futures: Unsubscribed from streams: ${streams.join(", ")}`
        );
    }

    private handleOpen(): void {
        console.log("Binance Futures WebSocket connection established.");
        this.startPingPong();
        this.startConnectionTimeout();
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message.id) {
                if (message.id === 999) {
                    console.log(
                        "Binance Futures: Active subscriptions:",
                        message.result
                    );
                }
            } else {
                // 처리되지 않은 메시지는 표준화 및 이벤트 발생
                const standardizedData =
                    BinanceFuturesDataTransformer.transformToStandardFormat(
                        message
                    );
                this.emit("orderbook", standardizedData); // 표준화된 데이터 이벤트 발생
            }
        } catch (error) {
            console.error("Binance Futures: Failed to parse message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Binance Futures WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Binance Futures WebSocket connection closed.");
        this.stopPingPong();
        this.clearConnectionTimeout();
    }

    private startPingPong(): void {
        this.stopPingPong();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping();
                console.log(
                    "Binance Futures: Ping frame sent to maintain connection."
                );
            }
        }, 3 * 60 * 1000);
    }

    private stopPingPong(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
            console.log("Binance Futures: Ping-Pong timer stopped.");
        }
    }

    private startConnectionTimeout(): void {
        this.clearConnectionTimeout();
        this.connectionTimeoutTimer = setTimeout(() => {
            console.log(
                "Binance Futures: 24시간이 경과하여 WebSocket 연결 종료."
            );
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
            console.error("Binance Futures WebSocket is not connected.");
        }
    }

    private getNextRequestId(): number {
        return this.requestId++;
    }
}
