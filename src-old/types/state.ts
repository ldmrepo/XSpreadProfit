// src/types/state.ts

// 컴포넌트 상태 타입
export type State =
    | "INIT"
    | "STARTING"
    | "RUNNING"
    | "PAUSED"
    | "STOPPING"
    | "STOPPED"
    | "ERROR"

// 상태 전이 정보
export interface StateTransition {
    fromState: State
    toState: State
    timestamp: number
    reason?: string
}

// 상태 이력
export interface StateHistory {
    state: State
    timestamp: number
    metadata: Record<string, any>
}

// 컴포넌트 상태 정보
export interface ComponentState {
    componentId: string
    state: State
    timestamp: number
    metadata: Record<string, any>
}

// 상태 리스너
export interface StateListener {
    onStateChange(componentId: string, oldState: State, newState: State): void
}
