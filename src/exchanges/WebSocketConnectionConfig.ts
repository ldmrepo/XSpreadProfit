/**
 * File: src/exchanges/WebSocketConnectionConfig.ts
 * Description: WebSocket 연결 및 메시지 제한 속성 타입 정의
 */

/** WebSocket 연결 속성 */
export interface WebSocketConnectionConfig {
    /** 단일 WebSocket 연결의 최대 유효 시간 (단위: 밀리초) */
    connectionDurationLimit: number // 24시간 -> 86,400,000ms
    /** 서버에서 클라이언트로 Ping 프레임 전송 간격 (단위: 밀리초) */
    pingInterval: number // 5분 -> 300,000ms
    /** 서버가 Pong 응답을 기다리는 최대 시간 (단위: 밀리초) */
    pongTimeout: number // 15분 -> 900,000ms
}

/** WebSocket 메시지 제한 속성 */
export interface WebSocketMessageLimits {
    /** 단일 WebSocket 연결에서 초당 허용되는 최대 메시지 수 */
    messageRateLimit: number // 10 메시지/초
    /** 단일 WebSocket 연결에서 구독 가능한 최대 스트림 수 */
    streamLimitPerConnection: number // 200 스트림
}

/** WebSocket 설정 통합 타입 */
export interface WebSocketConfig
    extends WebSocketConnectionConfig,
        WebSocketMessageLimits {
    url: string
    wsUrl: string
}
