// src/types/buffer.ts
/**
 * 버퍼 관리를 위한 타입 정의
 * - 버퍼 설정 및 메트릭 인터페이스
 * - 버퍼 이벤트 타입
 */

export interface BufferConfig {
    maxSize: number // 최대 버퍼 크기
    flushThreshold: number // 플러시 임계값 (%)
    flushInterval: number // 주기적 플러시 간격 (ms)
}

export interface BufferMetrics {
    size: number // 현재 크기
    totalItems: number // 전체 처리 항목 수
    droppedItems: number // 버퍼 초과로 삭제된 항목 수
    flushCount: number // 플러시 횟수
    lastFlushTime: number // 마지막 플러시 시간
    utilizationRate: number // 사용률 (%)
}

export type BufferEventType = "FULL" | "FLUSHED" | "DROPPED" | "ERROR"
