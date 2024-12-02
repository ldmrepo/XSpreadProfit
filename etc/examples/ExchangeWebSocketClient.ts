import { EventEmitter } from "events";
import { BaseSubscriptionOptions } from "./BaseSubscriptionOptions";
export interface ExchangeWebSocketClient extends EventEmitter {
    connect(): void;
    disconnect(): void;
    subscribe(streams: string[], options?: BaseSubscriptionOptions): void;
    unsubscribe(streams: string[]): void;
    listSubscriptions(): void;

    connectAndSubscribe(
        streams: string[],
        options?: BaseSubscriptionOptions
    ): void;
    disconnectUunsubscribe(streams: string[]): void;
}
