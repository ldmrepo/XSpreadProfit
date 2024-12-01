import { EventEmitter } from "events";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";

export class ExchangeWebSocketManager extends EventEmitter {
    private client: ExchangeWebSocketClient;

    constructor(client: ExchangeWebSocketClient) {
        super(); // EventEmitter 초기화

        this.client = client;

        // 클라이언트에서 발생한 표준 데이터 이벤트를 구독
        this.client.on("orderbook", (data) => this.handleClientData(data));
    }

    public setClient(client: ExchangeWebSocketClient): void {
        console.log("INFO: Setting a new WebSocket client.");
        this.client = client;
    }

    public connect(): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        console.log("INFO: Connecting WebSocket...");
        this.client.connect();
    }

    public disconnect(): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        console.log("INFO: Disconnecting WebSocket...");
        this.client.disconnect();
    }

    public subscribe(streams: string[]): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        console.log(`INFO: Subscribing to streams: ${streams.join(", ")}`);
        this.client.subscribe(streams);
    }

    public unsubscribe(streams: string[]): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        console.log(`INFO: Unsubscribing from streams: ${streams.join(", ")}`);
        this.client.unsubscribe(streams);
    }

    public listSubscriptions(): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        console.log("INFO: Listing active subscriptions.");
        this.client.listSubscriptions();
    }

    public connectAndSubscribe(streams: string[]): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        if (typeof this.client.connectAndSubscribe === "function") {
            console.log("INFO: Connecting and subscribing to streams...");
            this.client.connectAndSubscribe(streams);
        } else {
            console.error(
                "ERROR: The current WebSocket client does not support 'connectAndSubscribe'."
            );
        }
    }
    public disconnectUunsubscribe(streams: string[]): void {
        if (!this.client) {
            console.error("ERROR: No WebSocket client is set.");
            return;
        }
        if (typeof this.client.disconnectUunsubscribe === "function") {
            console.log(
                "INFO: Disconnecting and unsubscribing from streams..."
            );
            this.client.disconnectUunsubscribe(streams);
        } else {
            console.error(
                "ERROR: The current WebSocket client does not support 'disconnectUunsubscribe'."
            );
        }
    }

    // 클라이언트에서 발생한 데이터를 처리하여 관리자가 이벤트를 발생
    private handleClientData(data: any): void {
        console.log("INFO: Received data from client:", data);

        // 'data' 이벤트 발생
        this.emit("data", data);
    }
}
