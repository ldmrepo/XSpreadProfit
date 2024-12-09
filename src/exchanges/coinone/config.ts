/**
 * Path: src/exchanges/coinone/config.ts
 */
import { WebSocketConfig } from "../../websocket/types"

export const COINONE_WS_CONFIG: WebSocketConfig = {
    url: "wss://pubwss.coinone.co.kr/",
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
