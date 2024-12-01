# XSpreadProfit 시스템 아키텍처 설계서

문서 번호: ARCH-002  
버전: 2.0  
작성일: 2024-11-30  
작성자: System Architect  
승인자: Project Owner

## 문서 개정 이력

| 버전 | 일자       | 작성자           | 변경 내용           | 승인자        |
| ---- | ---------- | ---------------- | ------------------- | ------------- |
| 1.0  | 2024-11-30 | System Architect | 최초 작성           | Project Owner |
| 2.0  | 2024-11-30 | System Architect | 독립 실행 구조 반영 | Project Owner |

## 목차

1. [개요](#1-개요)
2. [시스템 구조](#2-시스템-구조)
3. [컴포넌트 설계](#3-컴포넌트-설계)
4. [데이터 흐름](#4-데이터-흐름)
5. [인터페이스 설계](#5-인터페이스-설계)
6. [성능 및 확장성](#6-성능-및-확장성)
7. [배포 전략](#7-배포-전략)

## 1. 개요

### 1.1 목적

본 문서는 XSpreadProfit 시스템의 전체 아키텍처를 정의하고, 각 컴포넌트의 설계 원칙과 독립적 실행 구조에 대한 세부 구현 지침을 제공한다.

### 1.2 범위

-   거래소별 독립 수집기 구조 정의
-   데이터 통합기 독립 실행 구조
-   컴포넌트 간 상호작용 방식
-   데이터 저장소 활용 방안
-   모니터링 시스템 구성

### 1.3 용어 정의

-   Exchange Collector: 개별 거래소의 데이터 수집 파이프라인
-   Market Connector: 거래소 API 연동 컴포넌트
-   Data Integrator: 수집된 데이터의 통합 분석 컴포넌트

## 2. 시스템 구조

### 2.1 아키텍처 원칙

1. 독립성

    - 거래소별 수집기의 완전한 독립 실행
    - 데이터 통합기의 자율적 운영
    - 컴포넌트 간 느슨한 결합

2. 확장성

    - 거래소 추가에 따른 수집기 독립 확장
    - 분석 로직의 유연한 확장
    - 스케일 아웃 가능한 구조

3. 안정성
    - 장애 격리
    - 자동 복구
    - 상태 모니터링

### 2.2 시스템 구성도

```mermaid
flowchart TB
    subgraph External["External Systems / 외부 시스템"]
        EX1["Exchange 1 WebSocket/REST API<br>거래소 1 WebSocket/REST API"]
        EX2["Exchange 2 WebSocket/REST API<br>거래소 2 WebSocket/REST API"]
        EX3["Exchange N WebSocket/REST API<br>거래소 N WebSocket/REST API"]
    end

    subgraph Collection["Data Collection Layer / 데이터 수집 계층"]
        subgraph Collector1["Exchange 1 Collector / 거래소 1 수집기"]
            MC1["Market Connector 1<br>시장 연결기 1"]
            DC1["Data Collector 1<br>데이터 수집기 1"]
            DP1["Data Processor 1<br>데이터 처리기 1"]
        end

        subgraph Collector2["Exchange 2 Collector / 거래소 2 수집기"]
            MC2["Market Connector 2<br>시장 연결기 2"]
            DC2["Data Collector 2<br>데이터 수집기 2"]
            DP2["Data Processor 2<br>데이터 처리기 2"]
        end

        subgraph CollectorN["Exchange N Collector / 거래소 N 수집기"]
            MC3["Market Connector N<br>시장 연결기 N"]
            DC3["Data Collector N<br>데이터 수집기 N"]
            DP3["Data Processor N<br>데이터 처리기 N"]
        end
    end

    subgraph Integration["Data Integration Layer / 데이터 통합 계층"]
        DI["DataIntegrator<br>데이터 통합기"]
        PA1["Price Analyzer - Internal<br>가격 분석기 - 내부"]
        PA2["Price Analyzer - Cross Exchange<br>가격 분석기 - 거래소 간"]
    end

    subgraph Storage["Data Storage Layer / 데이터 저장 계층"]
        RD[(Redis Cache<br>Redis 캐시)]
        PG[(PostgreSQL DB<br>PostgreSQL DB)]
    end

    subgraph Monitoring["Monitoring & Logging / 모니터링 & 로깅"]
        ML["Metrics Logger<br>지표 로거"]
        PM["Performance Monitor<br>성능 모니터"]
    end

    %% Connections
    EX1 --> MC1
    MC1 --> DC1
    DC1 --> DP1
    DP1 --> RD

    EX2 --> MC2
    MC2 --> DC2
    DC2 --> DP2
    DP2 --> RD

    EX3 --> MC3
    MC3 --> DC3
    DC3 --> DP3
    DP3 --> RD

    RD --> DI
    DI --> PA1
    DI --> PA2
    PA1 --> PG
    PA2 --> PG

    %% Monitoring connections
    DP1 & DP2 & DP3 -.- ML
    DI -.- ML
    ML --> PM

    %% Node Styles with sophisticated colors
    classDef external fill:#4A5568,color:#E2E8F0,stroke:#2D3748
    classDef collector fill:#3182CE,color:#EBF8FF,stroke:#2C5282
    classDef processor fill:#38A169,color:#F0FFF4,stroke:#2F855A
    classDef integrator fill:#805AD5,color:#FAF5FF,stroke:#553C9A
    classDef storage fill:#DD6B20,color:#FFFAF0,stroke:#C05621
    classDef monitor fill:#E53E3E,color:#FFF5F5,stroke:#C53030

    %% Apply component styles
    class External,EX1,EX2,EX3 external
    class Collector1,Collector2,CollectorN,MC1,MC2,MC3,DC1,DC2,DC3,DP1,DP2,DP3 collector
    class Integration,DI,PA1,PA2 integrator
    class Storage,RD,PG storage
    class Monitoring,ML,PM monitor

    %% Subgraph styles with deeper background colors
    style External fill:#1A202C,color:#EDF2F7,stroke:#2D3748,stroke-width:2px
    style Collection fill:#1A365D,color:#EDF2F7,stroke:#2C5282,stroke-width:2px
    style Integration fill:#322659,color:#EDF2F7,stroke:#553C9A,stroke-width:2px
    style Storage fill:#7B341E,color:#EDF2F7,stroke:#C05621,stroke-width:2px
    style Monitoring fill:#742A2A,color:#EDF2F7,stroke:#C53030,stroke-width:2px
```

### 2.3 주요 컴포넌트 설명

#### 2.3.1 거래소별 수집기 (Exchange Collector)

-   독립적인 수집 파이프라인 구성
-   자체 설정 및 리소스 관리
-   구성 요소
    -   Market Connector: API 연동
    -   Data Collector: 데이터 수집
    -   Data Processor: 전처리 및 검증

#### 2.3.2 데이터 통합기 (Data Integrator)

-   독립적인 분석 프로세스
-   Redis 기반 데이터 조회
-   분석 결과의 독립적 저장

## 3. 컴포넌트 설계

### 3.1 Exchange Collector 상세 설계

```typescript
interface ExchangeCollector {
    readonly exchangeId: string;
    readonly marketConnector: MarketConnector;
    readonly dataProcessor: DataProcessor;

    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): CollectorStatus;
}

class ExchangeCollectorImpl implements ExchangeCollector {
    constructor(
        private config: CollectorConfig,
        private redisClient: RedisClient,
        private metricsLogger: MetricsLogger
    ) {}

    // 구현 상세...
}
```

### 3.2 Data Integrator 상세 설계

```typescript
interface DataIntegrator {
    readonly analyzers: PriceAnalyzer[];

    start(): Promise<void>;
    stop(): Promise<void>;
    getAnalysisStatus(): AnalysisStatus;
}

class DataIntegratorImpl implements DataIntegrator {
    constructor(
        private config: IntegratorConfig,
        private redisClient: RedisClient,
        private postgresClient: PostgresClient,
        private metricsLogger: MetricsLogger
    ) {}

    // 구현 상세...
}
```

## 4. 데이터 흐름

### 4.1 데이터 수집 흐름

1. Exchange Collector

    - WebSocket/REST API 데이터 수신
    - 데이터 검증 및 정규화
    - Redis 캐시 저장
    - 독립적 메트릭 생성

2. Data Integrator
    - Redis 데이터 주기적 조회
    - 가격차 분석 수행
    - PostgreSQL 결과 저장
    - 분석 메트릭 생성

## 5. 인터페이스 설계

### 5.1 데이터 저장소 인터페이스

```typescript
interface DataStore {
    // Redis 인터페이스
    saveMarketData(data: MarketData): Promise<void>;
    getMarketData(exchangeId: string): Promise<MarketData[]>;

    // PostgreSQL 인터페이스
    saveAnalysisResult(result: AnalysisResult): Promise<void>;
    getAnalysisHistory(params: QueryParams): Promise<AnalysisResult[]>;
}
```

## 6. 성능 및 확장성

### 6.1 성능 요구사항

-   수집기별 독립적 성능 보장
-   실시간 데이터 처리 지연 최소화
-   리소스 사용 효율성

### 6.2 확장성 전략

-   수평적 확장 가능한 구조
-   신규 거래소 추가 용이성
-   분석 로직 확장 유연성

## 7. 배포 전략

### 7.1 컨테이너화

-   컴포넌트별 독립 컨테이너
-   설정 외부화
-   리소스 제한 설정

### 7.2 운영 환경

-   수집기별 독립 배포
-   통합기 독립 배포
-   모니터링 시스템 구성
