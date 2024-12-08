/**
 * Path: src/exchanges/upbit/UpbitCollector.ts
 */
import { ExchangeCollector } from "../../collectors/ExchangeCollector";
import { WebSocketConfig } from "../../websocket/types";
import { WebSocketManager } from "../../websocket/WebSocketManagerState";
import { ConnectorManager } from "../../collectors/ConnectorManager";
import { UPBIT_WS_CONFIG } from "./config";
import { UpbitConnector } from "./UpbitConnector";

export class UpbitCollector extends ExchangeCollector {
    constructor(protected readonly socketManager: WebSocketManager) {
        super(
            "upbit",
            UPBIT_WS_CONFIG,
            socketManager,
            // ConnectorManager 팩토리 함수
            (exchangeName: string, config: WebSocketConfig) =>
                new ConnectorManager(
                    exchangeName,
                    config,
                    // UpbitConnector 팩토리 함수
                    (_id, _symbols) =>
                        new UpbitConnector("upbit", _symbols, socketManager)
                )
        );
    }
}
