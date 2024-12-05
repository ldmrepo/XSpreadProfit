// 수집기 메트릭스 타입 정의
export interface CollectorMetrics {
    timestamp: number // 매트릭스 측정 시간
    totalSymbols: number // 전체 수집 대상 코인 수
    connectorCount: number // 생성된 ExchangeConnector 개수
    groupedSymbolCount: number // 그룹화된 심볼 배열 개수
    currentState: string // 현재 수집기의 상태 (예: Ready, Running, Paused, Stopped)
    activeConnectors: number // 현재 실행 중인 ExchangeConnector 개수
    totalMessagesReceived: number // 총 수신된 메시지 개수
    totalErrors: number // 발생한 에러 총 개수
    averageMessageLatencyMs: number | null // 평균 메시지 지연 시간 (밀리초)
    lastError?: string // 마지막 에러 메시지 (선택적)
}

// 교환소 커넥터 메트릭스 타입 정의
export interface ExchangeConnectorMetrics {
    timestamp: number // 메트릭스 측정 시간
    totalSymbols: number // 관리 중인 총 코인 수
    state: string // 현재 커넥터 상태 (Ready, Connecting, Connected, etc.)
    activeSubscriptions: number // 활성 구독 개수
    failedAttempts: number // 실패한 연결 시도 횟수
    messagesReceived: number // 수신된 WebSocket 메시지 수
    messagesProcessed: number // 처리된 메시지 수
    reconnectAttempts: number // 재연결 시도 횟수
    averageMessageLatencyMs?: number // 평균 메시지 지연 시간 (optional)
    lastError?: string | null // 마지막으로 발생한 오류 메시지 (optional)
}
