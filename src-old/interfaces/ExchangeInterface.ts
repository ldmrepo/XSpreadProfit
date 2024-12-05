/**
 * src/interfaces/ExchangeInterface.ts
 *
 * Exchange Interface
 * - 거래소와 통신을 위한 WebSocket 및 REST API 인터페이스 정의
 * - 현물(Spot) 및 선물(Futures) 구분 처리
 * - 모든 응답은 표준화된 데이터와 거래소 종속 데이터를 포함
 */

export interface ExchangeInterface {
    /**
     * WebSocket 설정 반환
     * @returns WebSocket 설정 객체
     */
    getWebSocketConfig(): {
        spot_ws_url: string // WebSocket 서버 URL
        futures_ws_url: string // WebSocket 서버 URL
        reconnectInterval?: number // 재연결 간격(ms)
        pingInterval?: number // Ping 전송 간격(ms)
        pongTimeout?: number // Pong 응답 대기 시간(ms)
        maxReconnectAttempts?: number // 최대 재연결 시도 횟수
    }
    // WebSocket 요청 (Request)
    requestSpotSubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest
    requestFuturesSubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest
    requestSpotUnsubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest
    requestFuturesUnsubscribeStream(
        params: string[],
        requestId: number
    ): SubscriptionRequest
    requestSpotSubscriptionListStream(
        requestId: number
    ): SubscriptionListRequest
    requestFuturesSubscriptionListStream(
        requestId: number
    ): SubscriptionListRequest

    // WebSocket 응답 (Response)
    responseSpotSubscribe(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionResponse>
    responseFuturesSubscribe(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionResponse>
    responseSpotUnsubscribe(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionResponse>
    responseFuturesUnsubscribe(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionResponse>
    responseSpotSubscriptionList(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionListResponse>
    responseFuturesSubscriptionList(
        message: WebSocketMessage
    ): StandardizedResponse<SubscriptionListResponse>
    responseSpotOrderBookUpdate(
        message: WebSocketMessage
    ): StandardizedResponse<OrderBookResponse>
    responseFuturesOrderBookUpdate(
        message: WebSocketMessage
    ): StandardizedResponse<OrderBookResponse>

    // REST API 요청 (Request)
    requestSpotExchangeInfoApi(): ApiRequest // REST API 현물 거래 정보 요청
    requestFuturesExchangeInfoApi(): ApiRequest // REST API 선물 거래 정보 요청
    requestSpotSymbolsApi(): ApiRequest // REST API 현물 심볼 리스트 요청
    requestFuturesSymbolsApi(): ApiRequest // REST API 선물 심볼 리스트 요청
    requestSpotOrderBookDataApi(symbols: string[]): ApiRequest // REST API 현물 오더북 데이터 요청
    requestFuturesOrderBookDataApi(symbols: string[]): ApiRequest // REST API 선물 오더북 데이터 요청

    // REST API 응답 (Response)
    responseSpotExchangeInfoApi(data: any): StandardizedResponse<ExchangeInfo> // REST API 현물 거래 정보 응답
    responseFuturesExchangeInfoApi(
        data: any
    ): StandardizedResponse<ExchangeInfo> // REST API 선물 거래 정보 응답
    responseSpotSymbolsApi(data: any): StandardizedResponse<string[]> // REST API 현물 심볼 리스트 응답
    responseFuturesSymbolsApi(data: any): StandardizedResponse<string[]> // REST API 선물 심볼 리스트 응답

    // WebSocket 메시지 파싱 (Parsing)
    parseSocketMessage(message: WebSocketMessage): ParsedSocketMessage
}

// 표준화된 응답 데이터 구조
export interface StandardizedResponse<T> {
    standard: T
    specific?: ExchangeSpecificResponse
}

export interface ExchangeSpecificResponse {
    rawResponse: any
    additionalData?: any
}

export interface ApiRequest {
    url: string // 요청할 URL
    params?: Record<string, any> // 요청 파라미터 (선택)
    transformResponse?: (data: any) => any // transformResponse 추가
}

// WebSocket 메시지 파싱 결과 타입
export interface ParsedSocketMessage {
    type: string // 메시지 유형 (예: "SUBSCRIPTION", "ORDER_BOOK", "TRADE")
    data: any // 메시지 데이터 (구체적인 데이터는 type에 따라 다름)
}

// 요청 및 응답 데이터 타입 정의 (기존과 동일)
export interface SubscriptionRequest {
    method: "SUBSCRIBE" | "UNSUBSCRIBE" | "LIST_SUBSCRIPTIONS"
    params: string[]
    id: number
}

export interface SubscriptionResponse {
    success: boolean
    message?: string
}

export interface SubscriptionListRequest {
    method: "LIST_SUBSCRIPTIONS"
    id: number
}

export interface SubscriptionListResponse {
    subscriptions: string[]
}

export interface WebSocketMessage {
    type: string
    data: any
}

export interface OrderBookResponse {
    symbol: string
    lastUpdateId: number
    bids: { price: number; quantity: number }[]
    asks: { price: number; quantity: number }[]
}

export interface ExchangeInfo {
    symbols: ExchangeSymbolInfo[]
}

export interface ExchangeSymbolInfo {
    symbol: string
    status: string
    baseAsset: string
    quoteAsset: string
    filters: FilterInfo[]
}

export interface FilterInfo {
    filterType: string
    tickSize?: string
    minQty?: string
}
