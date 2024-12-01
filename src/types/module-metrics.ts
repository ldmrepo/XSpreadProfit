/**
 * @file src/types/module-metrics.ts
 * @description 모듈 메트릭 정의
 */

// 모듈 메트릭 인터페이스 정의
export interface ModuleMetrics {
    memory: number; // 현재 메모리 사용량 (bytes)
    uptime: number; // 모듈 실행 시간 (ms)
    events: {
        processed: number; // 처리된 이벤트 수
        failed: number; // 실패한 이벤트 수
    };
}

export interface CoreMetrics extends ModuleMetrics {
    connection: {
        status: "CONNECTED" | "DISCONNECTED" | "ERROR";
        latency: number; // ms
    };
    performance: {
        throughput: number; // msgs/sec
        errorRate: number; // percentage
    };
    subscription: {
        activeCount: number;
        totalMessages: number;
        failedMessages: number;
    };
}
