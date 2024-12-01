### **수집기 (Collector) 상세 스펙**

---

## **1. 설계 목표**

-   **실시간 데이터 수집**: 거래소 API를 통해 데이터를 효율적으로 수집하고 등록기로 전송.
-   **1:1 관계 유지**: 각 수집기는 고유한 등록기와 1:1 관계를 가지며 독립적으로 동작.
-   **독립성**:
    -   각 수집기는 다른 수집기와 상호 의존하지 않음.
    -   장애 발생 시 개별 복구가 가능하며, 등록기로 데이터를 안정적으로 전달.
-   **API 제한 고려**:
    -   거래소 API의 요청 제한(Rate Limit)을 준수하며, 다수의 WebSocket 연결로 분산 처리.
-   **안정성**: 장애 시 자동 복구 메커니즘 및 REST API 대체 방식을 통해 지속적인 데이터 수집.

---

## **2. 기능 명세**

### **2.1 데이터 수집**

-   **WebSocket 연결**:
    -   거래소의 WebSocket API를 통해 데이터를 수집.
    -   연결 끊김이나 오류 발생 시 자동 재연결.
-   **REST API 대체**:
    -   WebSocket 장애 시 REST API를 통해 데이터를 주기적으로 수집.
    -   복구 후 WebSocket으로 전환.

### **2.2 구독 관리**

-   **구독 그룹**:
    -   각 WebSocket 연결은 최대 500~1000개의 코인을 처리하며, API 제한에 따라 다수의 연결로 분산.
-   **구독 관리 메커니즘**:
    -   동적으로 구독 목록 추가/제거 가능.
    -   구독 상태를 모니터링하고 비정상 상태에서 복구.

### **2.3 데이터 전달**

-   **이벤트 기반 데이터 전달**:
    -   수집된 데이터를 등록기로 이벤트(`data`)를 통해 전송.
    -   데이터 전송 실패 시, 큐에 저장 후 재전송.

### **2.4 장애 관리**

-   **WebSocket 장애 처리**:
    -   연결 끊김 감지 후 즉시 재연결.
    -   복구 중 REST API를 통해 데이터를 수집.
-   **구독 그룹 장애 처리**:
    -   특정 구독 그룹에 오류 발생 시 해당 그룹만 복구.
    -   다른 그룹은 정상적으로 동작 유지.

### **2.5 메트릭 관리**

-   **핵심 메트릭**:
    -   연결 상태(연결 여부, 연결 시간)
    -   처리된 메시지 수
    -   실패 메시지 수
    -   구독 그룹 상태
-   **보고 방식**:
    -   실시간으로 `MetricManager`에 메트릭 전달.

---

## **3. 데이터 흐름**

```plaintext
[거래소 API] → [수집기] → [등록기] → [Redis]
       ↑         ↓         ↑         ↑
       └──── 복구 절차 ────┘         상태 보고
```

---

## **4. 주요 메서드 및 인터페이스**

### **4.1 메서드 정의**

```typescript
interface Collector {
    // WebSocket 연결 관리
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;

    // 구독 관리
    subscribe(symbols: string[]): Promise<void>;
    unsubscribe(symbols: string[]): Promise<void>;
    getSubscriptions(): string[];

    // 장애 복구
    handleFailure(groupId: string): Promise<void>;
    recover(): Promise<void>;

    // 메트릭 관리
    collectMetrics(): Metrics;
    reportMetrics(): void;
}
```

---

### **4.2 주요 메서드 구현**

#### **WebSocket 연결**

```typescript
async connect(): Promise<void> {
    if (this.isConnected()) {
        throw new Error("이미 연결되어 있습니다.");
    }

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
        console.log(`[Collector] WebSocket 연결 성공: ${this.url}`);
        this.subscribe(this.symbols); // 초기 구독
    });

    this.ws.on("message", (data) => {
        this.handleMessage(data);
    });

    this.ws.on("close", () => {
        console.log(`[Collector] WebSocket 연결 종료`);
        this.recover();
    });

    this.ws.on("error", (error) => {
        console.error(`[Collector] WebSocket 에러:`, error);
        this.recover();
    });
}
```

#### **데이터 처리 및 전송**

```typescript
private handleMessage(data: WebSocket.Data): void {
    try {
        const parsedData = JSON.parse(data.toString());
        console.log(`[Collector] 데이터 수신:`, parsedData);
        this.emit("data", parsedData); // 등록기로 전송
        this.updateMetrics({ processed: 1, failed: 0 });
    } catch (error) {
        console.error(`[Collector] 데이터 처리 실패:`, error);
        this.updateMetrics({ processed: 0, failed: 1 });
    }
}
```

#### **복구 메커니즘**

```typescript
async recover(): Promise<void> {
    console.log(`[Collector] 복구 절차 시작`);
    if (this.ws) {
        this.ws.close();
    }

    // REST API로 대체
    this.startRestFallback();

    // WebSocket 재연결 시도
    setTimeout(async () => {
        try {
            await this.connect();
            console.log(`[Collector] WebSocket 복구 성공`);
            this.stopRestFallback();
        } catch (error) {
            console.error(`[Collector] WebSocket 복구 실패, 재시도 중`);
            await this.recover();
        }
    }, 5000);
}
```

---

## **5. 상태 및 메트릭 관리**

### **5.1 상태 관리**

```typescript
interface CollectorState {
    connectionState: "CONNECTED" | "DISCONNECTED" | "RECOVERING";
    activeSubscriptions: string[];
    failureCount: number;
    recoveryAttempts: number;
}
```

### **5.2 메트릭 관리**

```typescript
interface Metrics {
    connectionTime: number; // 연결 지속 시간(ms)
    processedMessages: number; // 처리된 메시지 수
    failedMessages: number; // 실패 메시지 수
    queueUsage: number; // 큐 사용률
    recoveryTime: number; // 복구 소요 시간(ms)
}
```

---

## **6. 장애 처리 시나리오**

### **6.1 장애 유형**

| 장애 유형        | 복구 방식                            | 영향 범위        |
| ---------------- | ------------------------------------ | ---------------- |
| WebSocket 끊김   | REST API 대체 후 WebSocket 복구 시도 | 해당 거래소 수집 |
| 구독 그룹 비정상 | 그룹별 복구                          | 특정 구독 그룹   |
| 데이터 처리 실패 | 실패 데이터 큐 저장 및 재처리        | 해당 메시지      |
| 처리량 초과      | 큐 교체(로테이션)                    | 수집기 전체      |

---

## **7. 거래소 추가 시 구현사항**

1. **전용 수집기 생성**:
    - 거래소별 API 사양에 맞춘 Collector 구현.
    - 공통 기능은 추상 Collector 클래스를 사용하여 상속.
2. **구독 관리**:
    - 거래소별 요청 제한에 맞는 구독 그룹 크기 설정.
3. **REST API 연동**:
    - 거래소별 REST API 대체 로직 구현.

---

## **8. 기대 효과**

1. **실시간 데이터 안정성**:
    - 장애 발생 시 즉각 복구로 데이터 손실 방지.
2. **확장성 강화**:
    - 거래소별 독립적인 수집기/등록기로 확장 용이.
3. **운영 효율성**:
    - 효율적인 메모리 관리와 메트릭 보고를 통해 시스템 최적화.

---

추가적인 요구사항이나 수정 사항이 필요하면 말씀해주세요! 🚀
