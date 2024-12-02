import WebSocket, { RawData } from "ws";
import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { CoinoneDataTransformer } from "./CoinoneDataTransformer";

export class CoinoneWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;

    constructor() {
        super();
        this.baseUrl = "wss://api.coinone.co.kr/ws"; // Coinone's WebSocket URL
        this.ws = null;
    }

    public connect(): void {
        if (this.ws) {
            console.log("Closing existing Coinone WebSocket connection...");
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
            console.log("Disconnecting Coinone WebSocket...");
            this.ws.close();
            this.ws = null;
        }
    }

    public subscribe(streams: string[]): void {
        const payload = JSON.stringify({
            type: "subscribe",
            streams,
        });
        this.ws?.send(payload);
        console.log(`Subscribed to Coinone streams: ${streams.join(", ")}`);
    }

    public unsubscribe(streams: string[]): void {
        const payload = JSON.stringify({
            type: "unsubscribe",
            streams,
        });
        this.ws?.send(payload);
        console.log(`Unsubscribed from Coinone streams: ${streams.join(", ")}`);
    }

    public listSubscriptions(): void {
        console.error(
            "Coinone WebSocket does not support listing subscriptions."
        );
    }

    public connectAndSubscribe(streams: string[]): void {
        this.connect();
        this.ws?.once("open", () => this.subscribe(streams));
    }

    public disconnectUunsubscribe(streams: string[]): void {
        this.unsubscribe(streams);
        setTimeout(() => this.disconnect(), 1000);
    }

    private handleOpen(): void {
        console.log("Coinone WebSocket connection established.");
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            const standardizedData =
                CoinoneDataTransformer.transformToStandardFormat(message);
            this.emit("orderbook", standardizedData); // Emit standardized data
        } catch (error) {
            console.error("Failed to process Coinone message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Coinone WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Coinone WebSocket connection closed.");
    }
}
