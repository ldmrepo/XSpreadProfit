/**
 * Path: src/exchanges/binance/BinanceExchange.ts
 * 바이낸스 구현
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { BaseExchange } from "../common/BaseExchange"
import {
    ExchangeConfig,
    ExchangeMessageHandler,
    OrderBookCommon,
} from "../common/types"
import { BinanceConnector } from "./BinanceConnector"
import { BinanceMessageHandler } from "./BinanceMessageHandler"
import { BinanceOrderBookManager } from "./orderbook/BinanceOrderBookManager"
export class BinanceExchange extends BaseExchange {
    protected setupEventHandlers(): void {
        throw new Error("Method not implemented.")
    }
    protected createOrderBookManager(): OrderBookCommon {
        return new BinanceOrderBookManager()
    }

    protected createMessageHandler(): ExchangeMessageHandler {
        return new BinanceMessageHandler()
    }

    protected createConnector(config: ExchangeConfig): ExchangeConnector {
        return new BinanceConnector(
            config.name,
            config.symbols,
            this.webSocketManager
        )
    }
}
