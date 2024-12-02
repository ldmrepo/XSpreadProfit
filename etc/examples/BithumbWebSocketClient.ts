// BithumbWebSocketClient.ts
import WebSocket, { RawData } from "ws";
import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { BithumbDataTransformer } from "./BithumbDataTransformer";
import { BaseSubscriptionOptions } from "./BaseSubscriptionOptions";

export class BithumbWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;

    constructor() {
        super();
        this.baseUrl = "wss://pubwss.bithumb.com/pub/ws"; // Bithumb WebSocket URL
        this.ws = null;
    }
    connectAndSubscribe(
        streams: string[],
        options?: BaseSubscriptionOptions
    ): void {
        throw new Error("Method not implemented.");
    }
    disconnectUunsubscribe(streams: string[]): void {
        throw new Error("Method not implemented.");
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
            console.log("Disconnecting Bithumb WebSocket...");
            this.ws.close();
            this.ws = null;
        }
    }

    public subscribe(streams: string[]): void {
        const payload = {
            type: "orderbookdepth",
            symbols: streams,
        };
        this.send(payload);
        console.log(`Bithumb: Subscribed to streams: ${streams.join(", ")}`);
    }

    public unsubscribe(streams: string[]): void {
        console.error(
            "Bithumb WebSocket does not support explicit unsubscription."
        );
    }

    public listSubscriptions(): void {
        console.error(
            "Bithumb WebSocket does not support listing subscriptions."
        );
    }

    private handleOpen(): void {
        console.log("Bithumb WebSocket connection established.");
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message?.type === "orderbookdepth") {
                const standardizedData =
                    BithumbDataTransformer.transformToStandardFormat(message);
                this.emit("orderbook", standardizedData); // Emit standardized data
            } else {
                console.log("Bithumb: Received Data:", message);
            }
        } catch (error) {
            console.error("Bithumb: Failed to process message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Bithumb WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Bithumb WebSocket connection closed.");
    }

    private send(payload: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error("Bithumb WebSocket is not connected.");
        }
    }
}
