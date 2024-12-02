전체 프로젝트의 폴더 구조를 설명드리겠습니다:

```
market-data-collector/
|   .DS_Store
|   .env.example
|   .gitignore
|   .mocharc.json
|   create-project.sh
|   global.d.ts
|   jest.config.ts
|   package-lock.json
|   package.json
|   README.md
|   tsconfig.json
|
+---.vscode
|       settings.json
|
+---config
|       development.json
|       production.json
|       test.json
|
+---docker
|   |   docker-compose.yml
|   |
|   +---init
|   |   \---db
|   |           init.sql
|   |
|   +---postgres
|   |       postgresql.conf
|   |
|   \---redis
|           redis.conf
|
+---scripts
+---src
|   |   index.ts
|   |
|   +---adapters
|   |   +---binance
|   |   |       adapter.ts
|   |   |       types.ts
|   |   |
|   |   \---upbit
|   |           adapter.ts
|   |           types.ts
|   |
|   +---components
|   |       Collector.ts
|   |       Processor.ts
|   |
|   +---managers
|   |       ErrorManager.ts
|   |       EventManager.ts
|   |       MetricManager.ts
|   |       StateManager.ts
|   |       SystemManager.ts
|   |
|   +---types
|   |       config.ts
|   |       data.ts
|   |       errors.ts
|   |       events.ts
|   |       metrics.ts
|   |       state.ts
|   |
|   \---utils
|           config.ts
|           logger.ts
|           validators.ts
|
\---tests
        jest.config.js
        README.md
        setup.d.ts
        setup.js
        setup.ts
        simple.ts

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
