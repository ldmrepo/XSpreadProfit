/**
 * Path: src/exchanges/common/BaseExchange.ts
 * 거래소 기본 구현 클래스
 */
import {
    ExchangeConfig,
    ExchangeMessageHandler,
    OrderBookCommon,
} from "./types"
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketManager } from "../../websocket/WebSocketManager"
export abstract class BaseExchange<T = unknown> {
    protected orderBookManager: OrderBookCommon
    protected messageHandler: ExchangeMessageHandler
    protected connector: ExchangeConnector
    constructor(
        protected readonly webSocketManager: WebSocketManager, // WebSocketManager를 외부에서 주입받도록 수정
        config: ExchangeConfig
    ) {
        this.orderBookManager = this.createOrderBookManager()
        this.messageHandler = this.createMessageHandler()
        this.connector = this.createConnector(config)
        this.setupEventHandlers()
    }
    protected abstract setupEventHandlers(): void
    protected abstract createOrderBookManager(): OrderBookCommon
    protected abstract createMessageHandler(): ExchangeMessageHandler
    protected abstract createConnector(
        config: ExchangeConfig
    ): ExchangeConnector
}
