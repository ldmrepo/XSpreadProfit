전체 프로젝트의 폴더 구조를 설명드리겠습니다:

```
market-data-collector/
├── src/
│   ├── managers/              # 코어 매니저 클래스들
│   │   ├── EventManager.ts
│   │   ├── StateManager.ts
│   │   ├── MetricManager.ts
│   │   ├── ErrorManager.ts
│   │   └── SystemManager.ts
│   │
│   ├── components/            # 핵심 컴포넌트
│   │   ├── Collector.ts      # 수집기
│   │   └── Processor.ts      # 등록기
│   │
│   ├── types/                # 타입 정의
│   │   ├── config.ts         # 설정 관련 타입
│   │   ├── events.ts         # 이벤트 관련 타입
│   │   ├── metrics.ts        # 메트릭 관련 타입
│   │   ├── errors.ts         # 에러 관련 타입
│   │   └── data.ts           # 데이터 관련 타입
│   │
│   ├── utils/                # 유틸리티 함수들
│   │   ├── config.ts         # 설정 로드
│   │   ├── logger.ts         # 로깅
│   │   └── validators.ts     # 검증
│   │
│   ├── adapters/             # 거래소별 어댑터
│   │   ├── binance/
│   │   │   ├── adapter.ts
│   │   │   └── types.ts
│   │   └── upbit/
│   │       ├── adapter.ts
│   │       └── types.ts
│   │
│   └── index.ts              # 진입점
│
├── config/                    # 설정 파일들
│   ├── development.json
│   ├── production.json
│   └── test.json
│
├── tests/                    # 테스트 파일들
│   ├── unit/                 # 단위 테스트
│   │   ├── managers/
│   │   └── components/
│   │
│   ├── integration/          # 통합 테스트
│   │   ├── collectors/
│   │   └── processors/
│   │
│   └── fixtures/             # 테스트 데이터
│
├── docs/                     # 문서
│   ├── architecture.md       # 아키텍처 문서
│   ├── api.md               # API 문서
│   └── deployment.md        # 배포 가이드
│
├── scripts/                  # 유틸리티 스크립트
│   ├── setup.sh
│   └── deploy.sh
│
├── logs/                     # 로그 파일들
│   ├── error.log
│   └── access.log
│
├── .env                      # 환경 변수
├── .env.example             # 환경 변수 예시
├── .gitignore
├── package.json
├── tsconfig.json            # TypeScript 설정
├── jest.config.js           # Jest 테스트 설정
└── README.md
```

주요 디렉토리 설명:

1. src/

-   managers/: 핵심 관리 컴포넌트
-   components/: 주요 기능 컴포넌트
-   types/: 타입 정의
-   utils/: 유틸리티 함수
-   adapters/: 거래소별 구현

2. config/

-   환경별 설정 파일
-   시스템 구성 설정

3. tests/

-   unit/: 단위 테스트
-   integration/: 통합 테스트
-   fixtures/: 테스트 데이터

4. docs/

-   시스템 문서
-   API 문서
-   배포 가이드

5. scripts/

-   배포 스크립트
-   유틸리티 스크립트

이러한 구조는:

-   명확한 관심사 분리
-   쉬운 확장성
-   효율적인 유지보수
-   테스트 용이성

을 제공합니다.
