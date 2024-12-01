import WebSocket, { RawData } from "ws";
import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BybitDataTransformer } from "./BybitDataTransformer";

export class BybitWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;
    private pingInterval: NodeJS.Timeout | null;
    private reconnectInterval: NodeJS.Timeout | null;

    constructor() {
        super();
        this.baseUrl = "wss://stream.bybit.com/v5/public/spot"; // Bybit WebSocket URL
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
        console.log(`Bybit: Subscribed to topics: ${topics.join(", ")}`);
    }

    public unsubscribe(topics: string[]): void {
        const payload = {
            op: "unsubscribe",
            args: topics,
        };
        this.send(payload);
        console.log(`Bybit: Unsubscribed from topics: ${topics.join(", ")}`);
    }

    public listSubscriptions(): void {
        // Bybit's WebSocket API does not provide a method to list active subscriptions
        console.log("Bybit: Listing subscriptions is not supported.");
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
        console.log("Bybit WebSocket connection established.");
        this.startPing();
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message.topic && message.data) {
                const standardizedData =
                    BybitDataTransformer.transformToStandardFormat(
                        message.data
                    );
                this.emit("data", standardizedData);
            } else {
                console.log("Bybit: Received message:", message);
            }
        } catch (error) {
            console.error("Bybit: Failed to parse message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Bybit WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Bybit WebSocket connection closed.");
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
                console.log("Bybit: Ping sent to maintain connection.");
            }
        }, 20 * 1000); // Send ping every 20 seconds
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log("Bybit: Ping interval cleared.");
        }
    }

    private scheduleReconnect(): void {
        this.stopReconnect();
        this.reconnectInterval = setTimeout(() => {
            console.log("Bybit: Attempting to reconnect...");
            this.connect();
        }, 5000); // Attempt to reconnect after 5 seconds
    }

    private stopReconnect(): void {
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
            console.log("Bybit: Reconnect interval cleared.");
        }
    }

    private send(payload: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error("Bybit WebSocket is not connected.");
        }
    }
}
