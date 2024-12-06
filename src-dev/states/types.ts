/**
 * Path: src/states/types.ts
 * 커넥터 상태 정의 및 상태 전이 관리
 */

export enum ConnectorState {
    INITIAL = "INITIAL",
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    SUBSCRIBING = "SUBSCRIBING",
    SUBSCRIBED = "SUBSCRIBED",
    ERROR = "ERROR",
    DISCONNECTING = "DISCONNECTING",
    DISCONNECTED = "DISCONNECTED",
}

export type StateChangeEvent = {
    previousState: ConnectorState
    currentState: ConnectorState
    timestamp: number
}

export interface StateContext {
    state: ConnectorState
    timestamp: number
    error?: Error
}
export const validStateTransitions: Record<ConnectorState, ConnectorState[]> = {
    [ConnectorState.INITIAL]: [
        ConnectorState.CONNECTING,
        ConnectorState.ERROR, // 에러 허용
    ],
    [ConnectorState.CONNECTING]: [
        ConnectorState.CONNECTED,
        ConnectorState.SUBSCRIBING, // SUBSCRIBING 전환 허용
        ConnectorState.ERROR, // 연결 중 에러 허용
        ConnectorState.DISCONNECTED, // 연결 시도 중 종료 가능
    ],
    [ConnectorState.CONNECTED]: [
        ConnectorState.SUBSCRIBING,
        ConnectorState.ERROR, // 연결 후 에러 허용
        ConnectorState.DISCONNECTING, // 연결 해제 중 상태 추가
        ConnectorState.DISCONNECTED, // 바로 종료 허용
    ],
    [ConnectorState.SUBSCRIBING]: [
        ConnectorState.SUBSCRIBED,
        ConnectorState.ERROR, // 구독 중 에러 허용
    ],
    [ConnectorState.SUBSCRIBED]: [
        ConnectorState.DISCONNECTING,
        ConnectorState.ERROR, // 구독 중 에러 허용
        ConnectorState.DISCONNECTED, // 바로 종료 허용
    ],
    [ConnectorState.ERROR]: [
        ConnectorState.CONNECTING, // 에러 후 재시도
        ConnectorState.DISCONNECTED, // 에러 후 종료 허용
    ],
    [ConnectorState.DISCONNECTING]: [
        ConnectorState.DISCONNECTED, // 해제 중 종료 허용
        ConnectorState.ERROR, // 해제 중 에러 허용
    ],
    [ConnectorState.DISCONNECTED]: [
        ConnectorState.CONNECTING, // 종료 후 재연결 허용
    ],
}

export interface StateTransitionEvent {
    id: string
    previousState: ConnectorState
    currentState: ConnectorState
    timestamp: number
    metadata?: Record<string, unknown>
}
