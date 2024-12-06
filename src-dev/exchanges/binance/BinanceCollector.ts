/**
 * Path: src/exchanges/binance/BinanceCollector.ts
 * 바이낸스 수집기
 */
import { ExchangeCollector } from "../../collectors/ExchangeCollector"
import { BinanceConnector } from "./BinanceConnector"
import { BINANCE_WS_CONFIG } from "./config"

export class BinanceCollector extends ExchangeCollector {
    constructor() {
        super("binance", BINANCE_WS_CONFIG)
    }

    protected createConnector(id: string, symbols: string[]) {
        return new BinanceConnector(id, symbols, BINANCE_WS_CONFIG)
    }
}
