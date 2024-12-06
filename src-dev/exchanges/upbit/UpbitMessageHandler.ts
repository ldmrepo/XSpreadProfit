/**
 * Path: src/exchanges/upbit/UpbitMessageHandler.ts
 * 업비트 메시지 처리기
 */
import { WebSocketMessage } from "../../websocket/types"
import { WebSocketError, ErrorCode } from "../../errors/types"
import { UpbitOrderbookMessage, UpbitRawMessage } from "./types"

export class UpbitMessageHandler {
    handleMessage(data: unknown): WebSocketMessage {
        if (!this.isValidMessage(data)) {
            throw new WebSocketError(
                ErrorCode.MESSAGE_PARSE_ERROR,
                "Invalid Upbit message format"
            )
        }

        const message = data as UpbitRawMessage
        switch (message.type) {
            case "trade":
                return this.handleTradeMessage(message)
            case "orderbook":
                return this.handleOrderbookMessage(message)
            default:
                throw new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    `Unknown message type: ${message.type}`
                )
        }
    }

    private handleTradeMessage(message: UpbitRawMessage): WebSocketMessage {
        return {
            type: "trade",
            symbol: message.code,
            data: {
                price: message.trade_price,
                quantity: message.trade_volume,
                timestamp: message.timestamp,
                side: message.ask_bid,
            },
        }
    }

    // private handleOrderbookMessage(message: UpbitRawMessage): WebSocketMessage {
    //     // Upbit orderbook 처리 로직
    //     return {
    //         type: "orderbook",
    //         symbol: message.code,
    //         data: {
    //             // Upbit orderbook 데이터 구조에 맞게 변환
    //             timestamp: message.timestamp,
    //             sequence: message.sequence,
    //             // ... 추가 orderbook 데이터
    //         },
    //     }
    // }

    private isValidMessage(data: unknown): data is UpbitRawMessage {
        const msg = data as UpbitRawMessage
        return (
            typeof msg === "object" &&
            msg !== null &&
            "type" in msg &&
            "code" in msg &&
            "timestamp" in msg
        )
    }

    private handleOrderbookMessage(
        message: UpbitOrderbookMessage
    ): WebSocketMessage {
        return {
            type: "orderbook",
            symbol: message.code,
            data: {
                timestamp: message.timestamp,
                sequence: message.sequence,
                asks: message.orderbook_units.map((unit) => ({
                    price: unit.ask_price,
                    quantity: unit.ask_size,
                })),
                bids: message.orderbook_units.map((unit) => ({
                    price: unit.bid_price,
                    quantity: unit.bid_size,
                })),
                totalAskSize: message.total_ask_size,
                totalBidSize: message.total_bid_size,
            },
        }
    }

    private isValidOrderbookMessage(
        data: unknown
    ): data is UpbitOrderbookMessage {
        const msg = data as UpbitOrderbookMessage
        return (
            this.isValidMessage(data) &&
            Array.isArray(msg.orderbook_units) &&
            typeof msg.total_ask_size === "number" &&
            typeof msg.total_bid_size === "number"
        )
    }
}
