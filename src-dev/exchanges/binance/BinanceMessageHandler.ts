/**
 * Path: src/exchanges/binance/BinanceMessageHandler.ts
 * 바이낸스 메시지 처리기
 */
import { WebSocketError, ErrorCode } from "../../errors/types"
import { WebSocketMessage } from "../../websocket/types"
import {
    BinanceBaseMessage,
    BinanceTradeMessage,
    BinanceBookTickerMessage,
    BinanceOrderBookMessage,
} from "./types"
export class BinanceMessageHandler {
    handleMessage(message: unknown): WebSocketMessage {
        if (!this.isValidMessage(message)) {
            throw new WebSocketError(
                ErrorCode.MESSAGE_PARSE_ERROR,
                "Invalid message format"
            )
        }

        const baseMsg = message as BinanceBaseMessage
        switch (baseMsg.e) {
            case "trade":
                return this.handleTradeMessage(message as BinanceTradeMessage)
            case "bookTicker":
                return this.handleBookTickerMessage(
                    message as BinanceBookTickerMessage
                )
            case "depthUpdate":
                return this.handleOrderBookMessage(
                    message as BinanceOrderBookMessage
                )
            default:
                throw new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    `Unknown message type: ${baseMsg.e}`
                )
        }
    }

    private handleTradeMessage(message: BinanceTradeMessage): WebSocketMessage {
        return {
            type: "trade",
            symbol: message.s,
            data: {
                tradeId: message.t,
                price: parseFloat(message.p),
                quantity: parseFloat(message.q),
                timestamp: message.T,
            },
        }
    }

    private handleBookTickerMessage(
        message: BinanceBookTickerMessage
    ): WebSocketMessage {
        return {
            type: "bookTicker",
            symbol: message.s,
            data: {
                bidPrice: parseFloat(message.b),
                bidQuantity: parseFloat(message.B),
                askPrice: parseFloat(message.a),
                askQuantity: parseFloat(message.A),
                timestamp: message.E,
            },
        }
    }

    private handleOrderBookMessage(
        message: BinanceOrderBookMessage
    ): WebSocketMessage {
        return {
            type: "orderBook",
            symbol: message.s,
            data: {
                firstUpdateId: message.U,
                lastUpdateId: message.u,
                bids: message.b.map(([price, quantity]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(quantity),
                })),
                asks: message.a.map(([price, quantity]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(quantity),
                })),
                timestamp: message.E,
            },
        }
    }

    private isValidMessage(message: unknown): boolean {
        const msg = message as BinanceBaseMessage
        return (
            typeof msg === "object" &&
            msg !== null &&
            "e" in msg &&
            "s" in msg &&
            "E" in msg
        )
    }
}
