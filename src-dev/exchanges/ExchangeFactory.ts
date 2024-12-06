import { WebSocketManager } from "../websocket/WebSocketManager"
import { BinanceExchange } from "./binance/BinanceExchange"
import { BaseExchange } from "./common/BaseExchange"
import { ExchangeConfig } from "./common/types"

/**
 * Path: src/exchanges/ExchangeFactory.ts
 * 거래소 팩토리
 */
export class ExchangeFactory {
    static create(
        webSocketManager: WebSocketManager,
        config: ExchangeConfig
    ): BaseExchange {
        switch (config.name.toLowerCase()) {
            case "binance":
                return new BinanceExchange(webSocketManager, config)
            default:
                throw new Error(`Unsupported exchange: ${config.name}`)
        }
    }
}
