/**
 * Path: src/exchanges/upbit/UpbitExchange.ts
 * 업비트 구현
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { BaseExchange } from "../common/BaseExchange"
import {
    ExchangeConfig,
    ExchangeMessageHandler,
    OrderBookCommon,
} from "../common/types"
import { UpbitOrderBookManager } from "./orderbook/UpbitOrderBookManager"
import { UpbitConnector } from "./UpbitConnector"
import { UpbitMessageHandler } from "./UpbitMessageHandler"
export class UpbitExchange extends BaseExchange {
    protected createOrderBookManager(): OrderBookCommon {
        return new UpbitOrderBookManager()
    }

    protected createMessageHandler(): ExchangeMessageHandler {
        return new UpbitMessageHandler()
    }

    protected createConnector(config: ExchangeConfig): ExchangeConnector {
        return new UpbitConnector(config.name, config.symbols, config.wsConfig)
    }
}
