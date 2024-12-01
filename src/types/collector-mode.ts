/**
 * @file src/types/collector-mode.ts
 * @description 수집기 동작 모드 정의
 */

/**
 * 수집기의 데이터 수집 모드
 * - WEBSOCKET: WebSocket을 통한 실시간 데이터 수집
 * - REST: REST API를 통한 폴링 방식 데이터 수집
 */
export enum CollectorMode {
    WEBSOCKET = "WEBSOCKET",
    REST = "REST",
}
