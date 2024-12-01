import WebSocket, { RawData } from "ws";
import { ExchangeWebSocketClient } from "./ExchangeWebSocketClient";
import { UpbitSubscriptionOptions } from "./UpbitSubscriptionOptions";
import { EventEmitter } from "events";
import { UpbitDataTransformer } from "./UpbitDataTransformer";

export class UpbitWebSocketClient
    extends EventEmitter
    implements ExchangeWebSocketClient
{
    private baseUrl: string;
    private ws: WebSocket | null;
    private pingTimer: NodeJS.Timeout | null;
    private connectionTimeoutTimer: NodeJS.Timeout | null;

    constructor() {
        super();
        this.baseUrl = "wss://api.upbit.com/websocket/v1";
        this.ws = null;
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
            console.log("Disconnecting Upbit WebSocket...");
            this.ws.close();
            this.ws = null;
        }
        this.stopPingPong();
        this.clearConnectionTimeout();
    }

    public subscribe(
        streams: string[],
        options?: UpbitSubscriptionOptions
    ): void {
        const payload = [
            { ticket: "1" },
            {
                type: "orderbook",
                codes: streams,
                level: options?.level || 0,
                is_only_snapshot: options?.isOnlySnapshot || false,
                is_only_realtime: options?.isOnlyRealtime || true,
            },
            { format: "SIMPLE" },
        ];
        this.send(payload);
        console.log(
            `Upbit: Subscribed to orderbook streams: ${streams.join(", ")}`
        );
    }

    public unsubscribe(streams: string[]): void {
        console.error("Unsubscription not supported for Upbit.");
    }

    public listSubscriptions(): void {
        const payload = [
            { method: "LIST_SUBSCRIPTIONS" }, // 요청 메서드
            { ticket: "2" }, // 고유 티켓 ID
        ];

        this.send(payload);

        console.log("Upbit: Requested list of active subscriptions.");
    }

    public connectAndSubscribe(
        streams: string[],
        options?: UpbitSubscriptionOptions
    ): void {
        this.connect();
        this.ws?.once("open", () => this.subscribe(streams, options));
    }

    public disconnectUunsubscribe(streams: string[]): void {
        setTimeout(() => {
            this.disconnect();
        }, 1000);
    }

    private handleOpen(): void {
        console.log("Upbit WebSocket connection established.");
        this.startPingPong();
        this.startConnectionTimeout();
    }

    private handleMessage(data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            if (message.method === "LIST_SUBSCRIPTIONS") {
                console.log("Upbit: Active subscriptions:", message.result);
            } else {
                // 수시한 메시지의 유요성 검사
                if (
                    message?.ty === "orderbook" &&
                    message?.obu &&
                    message?.cd
                ) {
                    const standardizedData =
                        UpbitDataTransformer.transformToStandardFormat(message);
                    this.emit("orderbook", standardizedData); // 표준화된 데이터 이벤트 발생
                } else {
                    console.log(
                        "Upbit: Unsupported message type:",
                        message.type
                    );
                }
            }
        } catch (error) {
            console.error("Upbit: Failed to parse message:", error);
        }
    }

    private handleError(error: Error): void {
        console.error("Upbit WebSocket error:", error.message);
    }

    private handleClose(): void {
        console.log("Upbit WebSocket connection closed.");
        this.stopPingPong();
        this.clearConnectionTimeout();
    }

    private startPingPong(): void {
        this.stopPingPong();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                console.log("Upbit: Maintaining connection with ping frame.");
            }
        }, 3 * 60 * 1000); // 3분
    }

    private stopPingPong(): void {
        console.log("Upbit: Ping-Pong timer stopped.");
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private startConnectionTimeout(): void {
        this.clearConnectionTimeout();
        this.connectionTimeoutTimer = setTimeout(() => {
            console.log("Upbit: 24시간이 경과하여 WebSocket 연결 종료.");
            this.disconnect();
        }, 24 * 60 * 60 * 1000); // 24시간
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
            console.error("Upbit WebSocket is not connected.");
        }
    }
}
