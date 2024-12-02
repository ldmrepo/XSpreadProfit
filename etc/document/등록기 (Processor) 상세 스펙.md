### **등록기 (Processor) 상세 스펙**

---

## **1. 설계 목표**

-   **고속 데이터 처리**: 수집기에서 전달된 데이터를 실시간으로 검증, 정규화, 저장.
-   **효율적 메모리 관리**: 고정 메모리 할당과 큐를 통해 메모리 누수 방지.
-   **지연 최소화**: 데이터 저장 및 처리에서 최소 지연 시간(<100ms) 달성.
-   **안정성**: 장애 발생 시 복구 절차를 통해 중단 없는 데이터 처리.
-   **확장성**: 거래소 추가 및 처리량 증가에 따른 확장 용이성.

---

## **2. 기능 명세**

### **2.1 데이터 처리**

-   **데이터 정규화**: 수집기에서 전달된 데이터를 표준화된 형식으로 변환.
-   **데이터 검증**: 데이터 형식과 내용의 유효성 확인.
-   **Redis 저장**: 검증된 데이터를 Redis에 저장.

### **2.2 메모리 관리**

-   **고정 메모리 큐**:
    -   큐 크기를 고정하여 메모리 사용량을 제한.
    -   큐가 가득 찰 경우, 오래된 데이터를 대체 (로테이션 방식).
-   **가비지 콜렉션 최소화**:
    -   메모리 할당 시 고정 크기를 사용해 GC 부하 감소.

### **2.3 장애 처리**

-   **등록기 장애**:
    -   Redis와 연결 실패 시, 데이터를 메모리 큐에 저장.
    -   Redis 연결 복구 후 큐 데이터를 재처리.
-   **수집기 장애**:
    -   수집기가 데이터를 전달하지 못할 경우, 로그 기록 및 복구 대기.
-   **데이터 처리 실패**:
    -   검증 실패 또는 데이터 저장 실패 시 실패 큐에 저장 및 재처리.

### **2.4 메트릭 관리**

-   **핵심 메트릭**:
    -   처리된 데이터 건수
    -   실패한 데이터 건수
    -   평균 처리 시간
    -   큐 사용률
-   **보고 방식**:
    -   정기적으로 `MetricManager`에 메트릭 전송.
    -   이벤트 기반으로 실시간 처리량 및 에러율 보고.

---

## **3. 데이터 흐름**

```plaintext
1. 수집기에서 메시지를 이벤트로 등록기에 전달.
2. 등록기는 데이터 정규화 및 검증 수행.
3. Redis 저장:
   - 저장 성공: 처리 완료로 상태 업데이트.
   - 저장 실패: 데이터 실패 큐에 저장.
4. 장애 발생 시:
   - 복구 절차 수행 (메모리 큐 → Redis).
5. 메트릭 보고:
   - 처리량, 실패율, 큐 상태를 관리기에 실시간 보고.
```

---

## **4. 주요 메서드 및 인터페이스**

### **4.1 메서드 정의**

```typescript
interface Processor {
    // 데이터 처리
    processData(data: any): Promise<void>;

    // 데이터 검증 및 정규화
    validateData(data: any): boolean;
    normalizeData(data: any): any;

    // 장애 복구
    recover(): Promise<void>;

    // 메트릭 관리
    collectMetrics(): Metrics;
    reportMetrics(): void;
}
```

---

### **4.2 주요 메서드 구현**

#### **데이터 처리**

```typescript
async processData(data: any): Promise<void> {
    try {
        // 데이터 검증
        if (!this.validateData(data)) {
            throw new Error("데이터 검증 실패");
        }

        // 데이터 정규화
        const normalizedData = this.normalizeData(data);

        // Redis 저장
        await this.redisClient.insert(normalizedData);
        this.updateMetrics({ processed: 1, failed: 0 });
    } catch (error) {
        console.error("데이터 처리 실패:", error);
        this.updateMetrics({ processed: 0, failed: 1 });

        // 실패 큐에 저장
        this.failureQueue.push(data);
    }
}
```

#### **메모리 관리**

```typescript
private initializeQueue(size: number): void {
    this.queue = new FixedSizeQueue(size);
    this.failureQueue = new FixedSizeQueue(size);
}
```

#### **장애 복구**

```typescript
async recover(): Promise<void> {
    console.log("Redis 복구 시도 중...");
    while (this.failureQueue.size() > 0) {
        try {
            const failedData = this.failureQueue.pop();
            if (failedData) {
                await this.redisClient.insert(failedData);
                console.log("복구 성공:", failedData);
            }
        } catch (error) {
            console.error("복구 실패:", error);
            this.failureQueue.push(failedData); // 복구 실패 시 다시 큐에 추가
            break; // 연결 복구 후 재시도
        }
    }
}
```

---

## **5. 상태 및 메트릭 관리**

### **5.1 상태 관리**

```typescript
interface HealthStatus {
    status: "healthy" | "unhealthy";
    currentState: StateType;
    lastStateChange: number;
    uptime: number;
    failureRate: number;
}
```

### **5.2 메트릭 관리**

```typescript
interface Metrics {
    processed: number; // 처리된 데이터 수
    failed: number; // 실패한 데이터 수
    queueUsage: number; // 큐 사용률 (%)
    avgProcessingTime: number; // 평균 처리 시간 (ms)
}
```

---

## **6. 장애 처리 시나리오**

### **6.1 장애 유형**

| 장애 유형        | 복구 방식                          | 처리 중단 여부 |
| ---------------- | ---------------------------------- | -------------- |
| Redis 연결 장애  | 메모리 큐에 저장 후 복구 시 재처리 | 중단 없음      |
| 데이터 검증 실패 | 실패 큐에 저장 및 로그 기록        | 중단 없음      |
| 처리량 초과      | 큐에서 오래된 데이터 교체          | 중단 없음      |
| 수집기 장애      | 대체 메시지 큐 사용                | 중단 없음      |

---

## **7. 확장 고려사항**

1. **다중 등록기 지원**:
    - 큐 크기와 처리량에 따라 등록기 수를 동적으로 조정.
2. **로드 밸런싱**:
    - 데이터 처리 부하를 균등 분배하기 위해 메시지 큐 활용.
3. **장애 알림**:
    - 장애 발생 시, 실시간 알림을 통해 즉각 대응 가능하도록 설정.

---

## **8. 기대 효과**

1. **고성능 처리**:
    - 고정 메모리 관리와 효율적인 큐 설계로 처리량 최적화.
2. **안정성 강화**:
    - 장애 복구 메커니즘과 독립적인 설계로 안정적인 시스템 운영.
3. **확장성 확보**:
    - 거래소 추가 및 처리량 증가에 유연하게 대응.

---

추가적인 요구사항이나 수정사항이 있다면 말씀해주세요. 🚀
