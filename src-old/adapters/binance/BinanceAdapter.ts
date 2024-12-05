/**
 * src/adapters/BinanceAdapter.ts
 *
 * Binance Exchange Adapter
 * - Binance WebSocket 및 REST API 연동
 * - WebSocket 메시지 파싱 기능 포함
 */

import {
    ExchangeInterface,
    SubscriptionRequest,
    StandardizedResponse,
    SubscriptionResponse,
    SubscriptionListResponse,
    OrderBookResponse,
    ParsedSocketMessage,
    WebSocketMessage,
    ExchangeInfo,
    SubscriptionListRequest,
    ApiRequest,
} from "../../interfaces/ExchangeInterface"
import { Logger } from "../../utils/logger"

export class BinanceAdapter implements ExchangeInterface {
    private spot_ws_url = "wss://stream.binance.com:9443/ws"
    private futures_ws_url = "wss://fstream.binance.com/ws"
    private spot_api_url = "https://api.binance.com/api/v3"
    private futures_api_url = "https://fapi.binance.com/fapi/v1"
    private logger = Logger.getInstance("BinanceAdapter")
    constructor(config?: any) {
        // 설정 초기화
        if (config) {
            this.spot_ws_url = config.spot_ws_url
            this.futures_ws_url = config.futures_ws_url
            this.spot_api_url = config.spot_api_url
            this.futures_api_url = config.futures_api_url
        }
    }
    /**
     * WebSocket 설정 반환
     * @returns WebSocket 설정 객체
     */
    getWebSocketConfig(config?: any): {
        spot_ws_url: string
        futures_ws_url: string
        reconnectInterval: number
        pingInterval: number
        pongTimeout: number
        maxReconnectAttempts: number
    } {
        return {
            // TODO: 수정 필요
            spot_ws_url: this.spot_ws_url,
            futures_ws_url: this.futures_ws_url,
            reconnectInterval: 5000,
            pingInterval: 30000,
            pongTimeout: 10000,
            maxReconnectAttempts: 10,
        }
    }
    // WebSocket 요청 (Request)
    /**
     * WebSocket 현물 데이터 구독 요청 생성
     * @param params 구독할 스트림 목록
     * @param requestId 요청 ID
     * @returns SubscriptionRequest
     */
    requestSpotSubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest {
        return { method: "SUBSCRIBE", params, id: requestId }
    }

    /**
     * WebSocket 선물 데이터 구독 요청 생성
     * @param params 구독할 스트림 목록
     * @param requestId 요청 ID
     * @returns SubscriptionRequest
     */
    requestFuturesSubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest {
        return { method: "SUBSCRIBE", params, id: requestId }
    }

    /**
     * WebSocket 현물 데이터 구독 취소 요청 생성
     * @param params 취소할 스트림 목록
     * @param requestId 요청 ID
     * @returns SubscriptionRequest
     */
    requestSpotUnsubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest {
        return { method: "UNSUBSCRIBE", params, id: requestId }
    }

    /**
     * WebSocket 선물 데이터 구독 취소 요청 생성
     * @param params 취소할 스트림 목록
     * @param requestId 요청 ID
     * @returns SubscriptionRequest
     */
    requestFuturesUnsubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest {
        return { method: "UNSUBSCRIBE", params, id: requestId }
    }

    /**
     * WebSocket 현물 활성 구독 리스트 요청 생성
     * @param requestId 요청 ID
     * @returns SubscriptionListRequest
     */
    requestSpotSubscriptionListStream(
        requestId: number
    ): SubscriptionListRequest {
        return { method: "LIST_SUBSCRIPTIONS", id: requestId }
    }

    /**
     * WebSocket 선물 활성 구독 리스트 요청 생성
     * @param requestId 요청 ID
     * @returns SubscriptionListRequest
     */
    requestFuturesSubscriptionListStream(
        requestId: number
    ): SubscriptionListRequest {
        return { method: "LIST_SUBSCRIPTIONS", id: requestId }
    }

    // WebSocket 응답 (Response)
    /**
     * WebSocket 현물 구독 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionResponse>
     */
    responseSpotSubscribe(
        message: any
    ): StandardizedResponse<SubscriptionResponse> {
        return this.parseSubscriptionResponse(message)
    }

    /**
     * WebSocket 선물 구독 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionResponse>
     */
    responseFuturesSubscribe(
        message: any
    ): StandardizedResponse<SubscriptionResponse> {
        return this.parseSubscriptionResponse(message)
    }

    /**
     * WebSocket 현물 구독 취소 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionResponse>
     */
    responseSpotUnsubscribe(
        message: any
    ): StandardizedResponse<SubscriptionResponse> {
        return this.parseSubscriptionResponse(message)
    }

    /**
     * WebSocket 선물 구독 취소 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionResponse>
     */
    responseFuturesUnsubscribe(
        message: any
    ): StandardizedResponse<SubscriptionResponse> {
        return this.parseSubscriptionResponse(message)
    }

    /**
     * WebSocket 현물 활성 구독 리스트 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionListResponse>
     */
    responseSpotSubscriptionList(
        message: any
    ): StandardizedResponse<SubscriptionListResponse> {
        return this.parseSubscriptionListResponse(message)
    }

    /**
     * WebSocket 선물 활성 구독 리스트 응답 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<SubscriptionListResponse>
     */
    responseFuturesSubscriptionList(
        message: any
    ): StandardizedResponse<SubscriptionListResponse> {
        return this.parseSubscriptionListResponse(message)
    }

    /**
     * WebSocket 현물 오더북 업데이트 메시지 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<OrderBookResponse>
     */
    responseSpotOrderBookUpdate(
        message: any
    ): StandardizedResponse<OrderBookResponse> {
        return this.parseOrderBookResponse(message)
    }

    /**
     * WebSocket 선물 오더북 업데이트 메시지 파싱
     * @param message WebSocket 메시지
     * @returns StandardizedResponse<OrderBookResponse>
     */
    responseFuturesOrderBookUpdate(
        message: any
    ): StandardizedResponse<OrderBookResponse> {
        return this.parseOrderBookResponse(message)
    }

    // WebSocket 메시지 파싱 (Parsing)
    /**
     * WebSocket 메시지 파싱하여 유형 분류
     * @param message WebSocket 메시지
     * @returns ParsedSocketMessage
     */
    parseSocketMessage(message: any): ParsedSocketMessage {
        const { type, data } = message
        this.logger.info(`🚀 ~ parseSocketMessage:${JSON.stringify(message)}`)

        if (message?.s && message?.b && message?.a) {
            return {
                type: "ORDER_BOOK",
                data: this.parseOrderBookResponse(message),
            }
        } else {
            switch (type) {
                case "SUBSCRIBE":
                case "UNSUBSCRIBE":
                case "LIST_SUBSCRIPTIONS":
                    return {
                        type: "SUBSCRIPTION",
                        data: this.parseSubscriptionResponse(data),
                    }
                case "ORDER_BOOK":
                    return {
                        type: "ORDER_BOOK",
                        data: this.parseOrderBookResponse(data),
                    }
                default:
                    return { type: "UNKNOWN", data } // 알 수 없는 유형
            }
        }
    }
    private transformSpotSymbols(data: any): string[] {
        return JSON.parse(data).symbols.map((s: any) => s.symbol)
    }

    private transformOrderBook(data: any): {
        lastUpdateId: number
        bids: { price: number; quantity: number }[]
        asks: { price: number; quantity: number }[]
    } {
        return {
            lastUpdateId: data.lastUpdateId,
            bids: data.bids.map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
            })),
            asks: data.asks.map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
            })),
        }
    }
    // REST API 요청
    /**
     * REST API 현물 거래 정보 요청
     * @returns ApiRequest
     */
    requestSpotExchangeInfoApi(): ApiRequest {
        return { url: `${this.spot_api_url}/exchangeInfo` }
    }

    /**
     * REST API 선물 거래 정보 요청
     * @returns ApiRequest
     */
    requestFuturesExchangeInfoApi(): ApiRequest {
        return { url: `${this.futures_api_url}/exchangeInfo` }
    }

    /**
     * REST API 현물 심볼 리스트 요청
     * @returns ApiRequest
     */
    requestSpotSymbolsApi(): ApiRequest {
        return {
            url: `${this.spot_api_url}/exchangeInfo`,
            transformResponse: (data: any) =>
                JSON.parse(data).symbols.map((s: any) => s.symbol),
        }
    }

    /**
     * REST API 선물 심볼 리스트 요청
     * @returns ApiRequest
     */
    requestFuturesSymbolsApi(): ApiRequest {
        return {
            url: `${this.futures_api_url}/exchangeInfo`,
            transformResponse: (data: any) =>
                JSON.parse(data).symbols.map((s: any) => s.symbol),
        }
    }

    /**
     * REST API 현물 오더북 데이터 요청
     * @param symbols 요청할 심볼 배열
     * @returns ApiRequest
     */
    requestSpotOrderBookDataApi(symbols: string[]): ApiRequest {
        return {
            url: `${this.spot_api_url}/depth`,
            params: { symbols },
            transformResponse: (data: any) => ({
                lastUpdateId: data.lastUpdateId,
                bids: data.bids.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
                asks: data.asks.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
            }),
        }
    }

    /**
     * REST API 선물 오더북 데이터 요청
     * @param symbols 요청할 심볼 배열
     * @returns ApiRequest
     */
    requestFuturesOrderBookDataApi(symbols: string[]): ApiRequest {
        return {
            url: `${this.futures_api_url}/depth`,
            params: { symbols },
            transformResponse: (data: any) => ({
                lastUpdateId: data.lastUpdateId,
                bids: data.bids.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
                asks: data.asks.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
            }),
        }
    }
    /**
     * REST API 현물 거래 정보 응답 파싱
     * @param data API에서 반환된 원본 데이터
     * @returns 표준화된 응답
     */
    responseSpotExchangeInfoApi(data: any): StandardizedResponse<ExchangeInfo> {
        const symbols = data.symbols.map((symbol: any) => ({
            symbol: symbol.symbol,
            status: symbol.status,
            baseAsset: symbol.baseAsset,
            quoteAsset: symbol.quoteAsset,
            filters: symbol.filters.map((filter: any) => ({
                filterType: filter.filterType,
                tickSize: filter.tickSize,
                minQty: filter.minQty,
            })),
        }))
        return {
            standard: { symbols },
            specific: { rawResponse: data },
        }
    }

    /**
     * REST API 선물 거래 정보 응답 파싱
     * @param data API에서 반환된 원본 데이터
     * @returns 표준화된 응답
     */
    responseFuturesExchangeInfoApi(
        data: any
    ): StandardizedResponse<ExchangeInfo> {
        const symbols = data.symbols.map((symbol: any) => ({
            symbol: symbol.symbol,
            status: symbol.status,
            baseAsset: symbol.baseAsset,
            quoteAsset: symbol.quoteAsset,
            filters: symbol.filters.map((filter: any) => ({
                filterType: filter.filterType,
                tickSize: filter.tickSize,
                minQty: filter.minQty,
            })),
        }))

        return {
            standard: { symbols },
            specific: { rawResponse: data },
        }
    }

    /**
     * REST API 현물 심볼 리스트 응답 파싱
     * @param data API에서 반환된 원본 데이터
     * @returns 표준화된 응답
     */
    responseSpotSymbolsApi(data: any): StandardizedResponse<string[]> {
        const symbols = data.symbols.map((symbol: any) => symbol.symbol)
        return {
            standard: symbols,
            specific: { rawResponse: data },
        }
    }

    /**
     * REST API 선물 심볼 리스트 응답 파싱
     * @param data API에서 반환된 원본 데이터
     * @returns 표준화된 응답
     */
    responseFuturesSymbolsApi(data: any): StandardizedResponse<string[]> {
        const symbols = data.symbols.map((symbol: any) => symbol.symbol)
        return {
            standard: symbols,
            specific: { rawResponse: data },
        }
    }

    // Private 파싱 메서드
    private parseSubscriptionResponse(
        message: any
    ): StandardizedResponse<SubscriptionResponse> {
        return {
            standard: {
                success: message.result === null,
                message: message.result || undefined,
            },
            specific: { rawResponse: message },
        }
    }

    private parseSubscriptionListResponse(
        message: any
    ): StandardizedResponse<SubscriptionListResponse> {
        return {
            standard: { subscriptions: message.result || [] },
            specific: { rawResponse: message },
        }
    }

    private parseOrderBookResponse(
        data: any
    ): StandardizedResponse<OrderBookResponse> {
        return {
            standard: {
                symbol: data.s || "",
                lastUpdateId: data.u,
                bids: data.b.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
                asks: data.a.map(([price, qty]: [string, string]) => ({
                    price: parseFloat(price),
                    quantity: parseFloat(qty),
                })),
            },
            specific: { rawResponse: data },
        }
    }

    private parseExchangeInfo(data: any): StandardizedResponse<ExchangeInfo> {
        const symbols = data.symbols.map((symbol: any) => ({
            symbol: symbol.symbol,
            status: symbol.status,
            baseAsset: symbol.baseAsset,
            quoteAsset: symbol.quoteAsset,
            filters: symbol.filters.map((filter: any) => ({
                filterType: filter.filterType,
                tickSize: filter.tickSize,
                minQty: filter.minQty,
            })),
        }))
        return { standard: { symbols }, specific: { rawResponse: data } }
    }
}
