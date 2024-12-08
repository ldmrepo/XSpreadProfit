/**
 * Path: src/exchanges/binance/BinanceCollector.ts
 */
import { ExchangeCollector } from "../../collectors/ExchangeCollector";
import { WebSocketConfig } from "../../websocket/types";
import { WebSocketManager } from "../../websocket/WebSocketManagerState";
import { ConnectorManager } from "../../collectors/ConnectorManager";
import { BINANCE_WS_CONFIG } from "./config";
import { BinanceConnector } from "./BinanceConnector";

export class BinanceCollector extends ExchangeCollector {
    constructor(protected readonly socketManager: WebSocketManager) {
        super(
            "binance",
            BINANCE_WS_CONFIG,
            socketManager,
            // ConnectorManager factory
            (exchangeName: string, config: WebSocketConfig) =>
                new ConnectorManager(
                    exchangeName,
                    config,
                    // BinanceConnector factory
                    (_id, _symbols) =>
                        new BinanceConnector(_id, _symbols, socketManager)
                )
        );
    }
}
