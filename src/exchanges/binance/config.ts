/**
 * Path: src/exchanges/binance/config.ts
 */
import { WebSocketConfig } from "../../websocket/types";

export const BINANCE_WS_CONFIG: WebSocketConfig = {
    url: "wss://stream.binance.com:9443/ws",
    options: {
        pingInterval: 30000,
        pongTimeout: 5000,
    },
    reconnectOptions: {
        maxAttempts: 5,
        delay: 1000,
        maxDelay: 10000,
    },
};
