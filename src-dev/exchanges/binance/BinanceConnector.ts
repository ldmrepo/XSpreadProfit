/**
 * Path: src/exchanges/binance/BinanceConnector.ts
 * 바이낸스 전용 커넥터
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector"
import { WebSocketMessage, WebSocketConfig } from "../../websocket/types"
import { BinanceRawMessage, BinanceSubscription } from "./types"
import { WebSocketError, ErrorCode } from "../../errors/types"

export class BinanceConnector extends ExchangeConnector {
    constructor(id: string, symbols: string[], config: WebSocketConfig) {
        super(id, symbols, config)
    }

    protected formatSubscription(symbol: string): BinanceSubscription {
        return {
            method: "SUBSCRIBE",
            params: [`${symbol.toLowerCase()}@trade`],
            id: Date.now(),
        }
    }

    protected isValidMessage(data: unknown): data is WebSocketMessage {
        try {
            const binanceMsg = data as BinanceRawMessage
            return (
                typeof binanceMsg === "object" &&
                binanceMsg !== null &&
                "e" in binanceMsg &&
                "s" in binanceMsg
            )
        } catch {
            return false
        }
    }

    protected normalizeMessage(message: BinanceRawMessage): WebSocketMessage {
        return {
            type: message.e,
            symbol: message.s,
            data: {
                price: parseFloat(message.p),
                quantity: parseFloat(message.q),
                timestamp: message.T,
                tradeId: message.t,
            },
        }
    }

    protected handleMessage(data: unknown): void {
        try {
            if (this.isValidMessage(data)) {
                const normalized = this.normalizeMessage(
                    data as BinanceRawMessage
                )
                this.metrics.messageCount++
                this.emit("message", normalized)
            } else {
                throw new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    "Invalid Binance message format"
                )
            }
        } catch (error) {
            this.handleError(error)
        }
    }
}
