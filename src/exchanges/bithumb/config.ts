/**
 * Path: src/exchanges/bithumb/config.ts
 */
import { WebSocketConfig } from "../../websocket/types"

export const BITHUMB_WS_CONFIG: WebSocketConfig = {
    url: "wss://pubwss.bithumb.com/pub/ws",
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
