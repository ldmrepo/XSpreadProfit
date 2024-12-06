/**
 * Path: src/exchanges/binance/BinanceCollector.ts
 * 바이낸스 수집기
 */
import { ConnectorManager } from "../../collectors/ConnectorManager"
import { ExchangeCollector } from "../../collectors/ExchangeCollector"
import { WebSocketConfig } from "../../websocket/types"
import { WebSocketManager } from "../../websocket/WebSocketManager"
import { BinanceConnector } from "./BinanceConnector"
import { BINANCE_WS_CONFIG } from "./config"

export class BinanceCollector extends ExchangeCollector {
    constructor(protected readonly socketManager: WebSocketManager) {
        super(
            "binance",
            BINANCE_WS_CONFIG,
            socketManager,
            // ConnectorManager 팩토리 함수
            (exchangeName: string, config: WebSocketConfig) =>
                new ConnectorManager(
                    exchangeName,
                    config,
                    // BinanceConnector 팩토리 함수
                    (_id, _symbols) =>
                        new BinanceConnector("binance", _symbols, socketManager)
                )
        )
    }
}
