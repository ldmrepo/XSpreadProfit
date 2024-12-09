/**
 * Path: src/exchanges/bybit/config.ts
 */
import { WebSocketConfig } from "../../websocket/types"

export const BYBIT_WS_CONFIG: WebSocketConfig = {
    url: "wss://stream.bybit.com/v5/public/spot",
    options: {
        pingInterval: 30000, // 30초
        pongTimeout: 5000, // 5초
    },
    reconnectOptions: {
        maxAttempts: 5,
        delay: 1000, // 1초
        maxDelay: 10000, // 10초
    },
}
