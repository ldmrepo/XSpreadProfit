// src/collectors/BinanceAdapter.ts
import {
    IExchangeAdapter,
    RestRequest,
    SocketRequest,
} from "./IExchangeAdapter"
import { WebSocketConfig } from "../exchanges/WebSocketConnectionConfig"
import { CoinInfo } from "../models/CoinInfo"

const BINACE_API_URL = "https://api.binance.com"

export class BinanceAdapter implements IExchangeAdapter {
    parsingSocketMessage(data: any) {
        const parsedData = JSON.parse(data.toString())
        console.log("Method not implemented.", parsedData)
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
