/**
 * Path: src/exchanges/binance/BinanceMessageHandler.ts
 * 바이낸스 메시지 처리기
 */
import { WebSocketError, ErrorCode } from "../../errors/types"
import { WebSocketMessage } from "../../websocket/types"
import { ExchangeMessageHandler } from "../common/types"
import {
    BinanceBaseMessage,
    BinanceTradeMessage,
    BinanceBookTickerMessage,
    BinanceOrderBookMessage,
} from "./types"
import {
    BinanceEventType,
    BinanceRawDataParser,
    ParsedMessage,
    ParsedBookTicker,
    ParsedDepthUpdate,
} from "./BinanceRawDataParser"

export class BinanceMessageHandler implements ExchangeMessageHandler {
    handleMessage(message: unknown): WebSocketMessage {
        const data = JSON.parse(message!.toString())
        if (!this.isValidMessage(data)) {
            throw new WebSocketError(
                ErrorCode.MESSAGE_PARSE_ERROR,
                "Invalid message format"
            )
        }

        const parsed = BinanceRawDataParser.parse(data)
        console.log("🚀 ~파싱데이타:", parsed)

        switch (parsed.type) {
            case BinanceEventType.DEPTH_UPDATE:
                return this.handleOrderBookMessage(parsed.data)
            case BinanceEventType.BOOK_TICKER:
                return this.handleBookTickerMessage(parsed.data)
            default:
                return {
                    type: "unknown",
                    symbol: parsed.data.s,
                    data: message?.toString(),
                }

            // throw new WebSocketError(
            //     ErrorCode.MESSAGE_PARSE_ERROR,
            //     `Unknown message type: ${baseMsg.e}`
            // )
        }
    }

    private handleBookTickerMessage(
        message: ParsedBookTicker
    ): WebSocketMessage {
        return {
            type: "bookTicker",
            symbol: message.s,
            data: message,
        }
    }

    private handleOrderBookMessage(
        message: ParsedDepthUpdate
    ): WebSocketMessage {
        return {
            type: "orderBook",
            symbol: message.s,
            data: message,
        }
    }

    isValidMessage(message: unknown): boolean {
        const msg = message as BinanceBaseMessage
        return (
            typeof msg === "object" // &&
            // msg !== null &&
            // "e" in msg &&
            // "s" in msg &&
            // "E" in msg
        )
    }
}
