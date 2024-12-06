/**
 * Path: src/exchanges/binance/config.ts
 * 바이낸스 설정 정의
 */
import { WebSocketConfig } from "../../websocket/types"

export const BINANCE_WS_CONFIG: WebSocketConfig = {
    url: "wss://stream.binance.com:9443/ws",
    options: {
        pingInterval: 30000, // 30초
        pongTimeout: 5000, // 5초
        reconnectInterval: 3000, // 3초
        maxReconnectAttempts: 5,
    },
}
