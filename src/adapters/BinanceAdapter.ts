// src/collectors/BinanceAdapter.ts
import {
    IExchangeAdapter,
    RestRequest,
    SocketRequest,
} from "./IExchangeAdapter"
import { WebSocketConfig } from "../exchanges/WebSocketConnectionConfig"
import { CoinInfo } from "../models/CoinInfo"
import { OrderBook } from "../models/coin.types"

const BINACE_API_URL = "https://api.binance.com"

export class BinanceAdapter implements IExchangeAdapter {
    normalizeBookTicker(data: any): OrderBook {
        if (!data || typeof data !== "object") {
            throw new Error("Invalid data format")
        }

        // 기본 검증: bids와 asks가 배열인지 확인
        const isValidArray = (arr: any) =>
            Array.isArray(arr) &&
            arr.every((item) => Array.isArray(item) && item.length === 2)

        const bids = isValidArray(data.b) ? data.b : []
        const asks = isValidArray(data.a) ? data.a : []

        return {
            lastUpdateId: data.u || data.lastUpdateId || 0, // 업데이트 ID (없으면 0으로 기본값 설정)
            timestamp: data.E || Date.now(), // 데이터 전송 시간 또는 현재 시간
            bids: bids.map(([price, quantity]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(quantity),
            })), // 매수 주문 변환
            asks: asks.map(([price, quantity]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(quantity),
            })), // 매도 주문 변환
        }
    }

    normalizeOrderBook(data: any): OrderBook {
        if (!data || !data.b || !data.a || !data.s || !data.u) {
            throw new Error("Invalid order book data")
        }

        return {
            lastUpdateId: data.u,
            timestamp: data.E,
            bids: data.b.map((bid: [string, string]) => ({
                price: parseFloat(bid[0]),
                quantity: parseFloat(bid[1]),
            })),
            asks: data.a.map((ask: [string, string]) => ({
                price: parseFloat(ask[0]),
                quantity: parseFloat(ask[1]),
            })),
        }
    }
    parsingSocketMessage(data: any) {
        const parsedData = JSON.parse(data.toString())
        if (this.isBookTicker(parsedData)) {
            console.log("Book Ticker 데이터:", parsedData)
        } else if (this.isOrderBook(parsedData)) {
            console.log("Order Book 데이터:", parsedData)
        } else {
            console.log("Method not implemented.", parsedData)
        }
    }
    isBookTicker(parsedData: any): boolean {
        try {
            // 필수 필드 정의
            const requiredFields = ["u", "s", "b", "B", "a", "A"]

            // 필수 필드 존재 여부 확인
            const hasRequiredFields = requiredFields.every((field) =>
                Object.prototype.hasOwnProperty.call(parsedData, field)
            )
            if (!hasRequiredFields) {
                return false
            }

            // 필드 타입 확인
            if (
                typeof parsedData.u !== "number" || // 업데이트 ID
                typeof parsedData.s !== "string" || // 심볼
                typeof parsedData.b !== "string" || // 매수 가격
                typeof parsedData.B !== "string" || // 매수 수량
                typeof parsedData.a !== "string" || // 매도 가격
                typeof parsedData.A !== "string" // 매도 수량
            ) {
                console.error(
                    "Book Ticker 데이터가 아님: 잘못된 필드 타입",
                    parsedData
                )
                return false
            }

            // 모든 검사를 통과하면 Book Ticker 데이터로 판단
            return true
        } catch (error) {
            console.error("Book Ticker 데이터 확인 중 오류:", error, parsedData)
            return false
        }
    }
    isOrderBook(parsedData: any): boolean {
        try {
            // 필수 필드 정의
            const requiredFields = ["lastUpdateId", "bids", "asks"]

            // 필수 필드 존재 여부 확인
            const hasRequiredFields = requiredFields.every((field) =>
                Object.prototype.hasOwnProperty.call(parsedData, field)
            )

            if (!hasRequiredFields) {
                return false
            }

            // 필드 타입 확인
            if (
                typeof parsedData.lastUpdateId !== "number" || // lastUpdateId는 숫자여야 함
                !Array.isArray(parsedData.bids) || // bids는 배열이어야 함
                !Array.isArray(parsedData.asks) // asks도 배열이어야 함
            ) {
                console.error(
                    "Order Book 데이터가 아님: 잘못된 필드 타입",
                    parsedData
                )
                return false
            }

            // bids와 asks 배열의 요소 확인
            const isValidPriceLevel = (level: any) =>
                Array.isArray(level) &&
                level.length === 2 &&
                typeof level[0] === "string" && // 가격은 문자열
                typeof level[1] === "string" // 수량은 문자열

            const areBidsValid = parsedData.bids.every(isValidPriceLevel)
            const areAsksValid = parsedData.asks.every(isValidPriceLevel)

            if (!areBidsValid || !areAsksValid) {
                console.error(
                    "Order Book 데이터가 아님: 잘못된 bids/asks 형식",
                    parsedData
                )
                return false
            }

            // 모든 검사를 통과하면 Order Book 데이터로 판단
            return true
        } catch (error) {
            console.error("Order Book 데이터 확인 중 오류:", error, parsedData)
            return false
        }
    }

    parsingOrderBook(data: any) {
        console.log("Method not implemented.")
    }
    parsingExchangeInfo(data: any) {
        console.log("Method not implemented.")
    }
    getWebSocketConfig(): WebSocketConfig {
        return {
            connectionDurationLimit: 86_400_000, // 24시간
            pingInterval: 300_000, // 5분
            pongTimeout: 900_000, // 15분
            messageRateLimit: 10, // 10 메시지/초
            streamLimitPerConnection: 200, // 200 스트림
            url: "wss://stream.binance.com:9443/ws/",
            wsUrl: "wss://stream.binance.com:9443/ws/",
        }
    }
    subscribe(coinInfos: CoinInfo[]): SocketRequest {
        // 구독 파라메터 생성
        const subscription = coinInfos.map(
            (coinInfo) =>
                `${coinInfo.symbol.toLowerCase()}@${coinInfo.methodType}`
        )
        return {
            method: "SUBSCRIBE",
            params: subscription,
            id: 10,
        }
    }
    unsubscribe(coinInfos: CoinInfo[]): SocketRequest {
        // 구독 해제 파라메터 생성
        const subscription = coinInfos.map(
            (coinInfo) =>
                `${coinInfo.symbol.toLowerCase()}@${coinInfo.methodType}`
        )
        return {
            method: "UNSUBSCRIBE",
            params: subscription,
            id: 20,
        }
    }
    listSubscriptions(): SocketRequest {
        return {
            method: "LIST_SUBSCRIPTIONS",
            id: 30,
        }
    }
    fetchExchangeInfo(): RestRequest {
        // REST API 호출 파라메터 생성
        console.log("BinanceAdapter.fetchExchangeInfo")
        return {
            method: "GET",
            url: "${BINACE_API_URL}/api/v3/exchangeInfo",
        }
    }
    fetchOrderBook(symbol: string, limit: number = 100): RestRequest {
        return {
            method: "GET",
            url: `https://api.binance.com/api/v3/depth`,
            params: {
                symbol,
                limit, // 기본값 100, 최대값 5000
            },
        }
    }

    getExchangeName(): string {
        return "Binance"
    }
}
