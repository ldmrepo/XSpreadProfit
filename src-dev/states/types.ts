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
    previousState: ConnectorState;
    currentState: ConnectorState;
    timestamp: number;
};

export interface StateContext {
    state: ConnectorState;
    timestamp: number;
    error?: Error;
}
export const validStateTransitions: Record<ConnectorState, ConnectorState[]> = {
    [ConnectorState.INITIAL]: [ConnectorState.CONNECTING],
    [ConnectorState.CONNECTING]: [
        ConnectorState.CONNECTED,
        ConnectorState.ERROR,
        ConnectorState.DISCONNECTED,
    ],
    [ConnectorState.CONNECTED]: [
        ConnectorState.SUBSCRIBING,
        ConnectorState.ERROR,
        ConnectorState.DISCONNECTING,
    ],
    [ConnectorState.SUBSCRIBING]: [
        ConnectorState.SUBSCRIBED,
        ConnectorState.ERROR,
    ],
    [ConnectorState.SUBSCRIBED]: [
        ConnectorState.ERROR,
        ConnectorState.DISCONNECTING,
    ],
    [ConnectorState.ERROR]: [
        ConnectorState.CONNECTING,
        ConnectorState.DISCONNECTED,
    ],
    [ConnectorState.DISCONNECTING]: [ConnectorState.DISCONNECTED],
    [ConnectorState.DISCONNECTED]: [ConnectorState.CONNECTING],
};

export const isValidStateTransition = (
    from: ConnectorState,
    to: ConnectorState
): boolean => {
    const validTransitions: Record<ConnectorState, ConnectorState[]> = {
        [ConnectorState.INITIAL]: [ConnectorState.CONNECTING],
        [ConnectorState.CONNECTING]: [
            ConnectorState.CONNECTED,
            ConnectorState.ERROR,
            ConnectorState.DISCONNECTED,
        ],
        [ConnectorState.CONNECTED]: [
            ConnectorState.SUBSCRIBING,
            ConnectorState.ERROR,
            ConnectorState.DISCONNECTING,
        ],
        [ConnectorState.SUBSCRIBING]: [
            ConnectorState.SUBSCRIBED,
            ConnectorState.ERROR,
        ],
        [ConnectorState.SUBSCRIBED]: [
            ConnectorState.ERROR,
            ConnectorState.DISCONNECTING,
        ],
        [ConnectorState.ERROR]: [
            ConnectorState.CONNECTING,
            ConnectorState.DISCONNECTED,
        ],
        [ConnectorState.DISCONNECTING]: [ConnectorState.DISCONNECTED],
        [ConnectorState.DISCONNECTED]: [ConnectorState.CONNECTING],
    };

    return validTransitions[from]?.includes(to) ?? false;
};
export interface StateTransitionEvent {
    id: string;
    previousState: ConnectorState;
    currentState: ConnectorState;
    timestamp: number;
    metadata?: Record<string, unknown>;
}
