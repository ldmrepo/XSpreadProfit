import WebSocket from "ws";
import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BinanceFuturesDataTransformer } from "./BinanceFuturesDataTransformer";

export class BinanceFuturesWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private ws: WebSocket | null = null;
    private readonly baseUrl: string = "wss://fstream.binance.com";

    connect(): void {
        this.ws = new WebSocket(`${this.baseUrl}/ws`);
        this.ws.on("open", () => {
            console.log("Connected to Binance Futures WebSocket");
        });
        this.ws.on("message", (data) => {
            const parsedData = JSON.parse(data.toString());
            const standardizedData =
                BinanceFuturesDataTransformer.transformToStandardFormat(
                    parsedData
                );
            this.emit("data", standardizedData);
        });
        this.ws.on("close", () => {
            console.log("Disconnected from Binance Futures WebSocket");
        });
        this.ws.on("error", (error) => {
            console.error("WebSocket error:", error);
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    subscribe(streams: string[]): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const params = streams.map((stream) => stream.toLowerCase());
            this.ws.send(
                JSON.stringify({
                    method: "SUBSCRIBE",
                    params,
                    id: Date.now(),
                })
            );
        }
    }

    unsubscribe(streams: string[]): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const params = streams.map((stream) => stream.toLowerCase());
            this.ws.send(
                JSON.stringify({
                    method: "UNSUBSCRIBE",
                    params,
                    id: Date.now(),
                })
            );
        }
    }

    listSubscriptions(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    method: "LIST_SUBSCRIPTIONS",
                    id: Date.now(),
                })
            );
        }
    }

    connectAndSubscribe(streams: string[]): void {
        this.connect();
        this.ws?.on("open", () => {
            this.subscribe(streams);
        });
    }

    disconnectUunsubscribe(streams: string[]): void {
        this.unsubscribe(streams);
        this.disconnect();
    }
}
