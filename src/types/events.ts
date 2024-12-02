// src/types/events.ts

// 이벤트 기본 인터페이스
export interface Event {
    id?: string
    type: string
    payload: any
    timestamp: number
    source: string
    metadata?: Record<string, any>
}

// 이벤트 타입 정의
export interface EventType {
    name: string
    priority: EventPriority
    retryable: boolean
    metadata?: Record<string, any>
}

// 이벤트 핸들러
export type EventHandler = (event: Event) => Promise<void>

// 이벤트 필터
export interface EventFilter {
    field: string
    operator: FilterOperator
    value: any
}

// 이벤트 우선순위
export type EventPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW"

// 필터 연산자
export type FilterOperator = "eq" | "ne" | "gt" | "lt" | "contains"

// 재시도 정책
export interface RetryPolicy {
    maxRetries: number
    retryInterval: number
    backoffRate: number
}

// 이벤트 구독 정보
export interface Subscription {
    id: string
    eventType: string
    handler: EventHandler
    filter?: EventFilter
    metadata?: Record<string, any>
}
