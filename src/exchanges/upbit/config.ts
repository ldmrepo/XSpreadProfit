/**
 * Path: src/exchanges/upbit/config.ts
 */
import { WebSocketConfig } from "../../websocket/types";

export const UPBIT_WS_CONFIG: WebSocketConfig = {
    url: "wss://api.upbit.com/websocket/v1",
    options: {
        pingInterval: 30000, // 30초
        pongTimeout: 5000, // 5초
    },
    reconnectOptions: {
        maxAttempts: 5,
        delay: 1000, // 1초
        maxDelay: 10000, // 10초
    },
};
