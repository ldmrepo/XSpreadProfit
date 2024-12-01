. 단, 코드의 시작은 파일경로명, 개요에 대한 코멘트, import 구분을 추가해주세요. 모든 기능을 생성하고 인터페이스 및 추상클래스를 제외하고 실제 구현 클래스는 기능만 나열하고 구현은 구현시 코멘트를 적어주세요. 클래스의 import 구문의 파일주 XSpreadProfit 시스템 클래스 설계서에 정의되지 않은 파일은 같이 생성해주세요. 이후 모든 코드생성은 동일한 규칙으로 일관성있게 작성합니다.

XSpreadProfit 시스템 클래스 설계서를 참조하여 CollectorErrorHandler 클래스를 생성해주세요. 단, 코드의 시작은 파일경로명, 개요에 대한 코멘트, import 구분을 추가해주세요. 모든 기능을 생성하고 인터페이스 및 추상클래스를 제외하고 실제 구현 클래스는 기능만 나열하고 구현은 구현시 코멘트를 적어주세요. 클래스의 import 구문의 파일주 XSpreadProfit 시스템 클래스 설계서에 정의되지 않은 파일은 같이 생성해주세요. 이후 모든 코드생성은 동일한 규칙으로 일관성있게 작성합니다.

XSpreadProfit 시스템 클래스 설계서를 참조하여 CollectorErrorHandler 인터페이스를 생성해주세요. 단, 코드의 시작은 파일경로명, 개요에 대한 코멘트, import 구분을 추가해주세요. 모든 기능을 생성하고 인터페이스 및 추상클래스를 제외하고 실제 구현 클래스는 기능만 나열하고 구현은 구현시 코멘트를 적어주세요. 클래스의 import 구문의 파일주 XSpreadProfit 시스템 클래스 설계서에 정의되지 않은 파일은 같이 생성해주세요.
클래스,인터페이스등은 반드시 분리되어 생성해야 합니다.
새로운 기능을 추가하거나, 확장해선 안됨. 이후 모든 코드생성은 동일한 규칙으로 일관성있게 작성합니다.

설계서에 정의된 클래스들을 인터페이스, 추상 클래스, 구현 클래스로 분류하여 정리하겠습니다:

코드의 시작은 파일경로명, 개요에 대한 코멘트, import 구분을 추가해주세요.
클래스,인터페이스등은 반드시 분리되어 생성해야 합니다.
새로운 기능을 추가하거나, 확장해선 안됨. 이후 모든 코드생성은 동일한 규칙으로 일관성있게 작성합니다.

### 인터페이스

1. MarketConnector
2. DataProcessor
3. DataStore
4. PriceAnalyzer

### 추상 클래스

1. BaseCollector
2. BaseDataProcessor

### 구현 클래스

1. ExchangeCollectorFactory
2. CollectorErrorHandler
3. CollectorStateManager
4. BinanceCollector
5. BybitCollector
6. BinanceDataProcessor
7. RedisStore
8. PostgresStore
9. InternalPriceAnalyzer
10. CrossExchangePriceAnalyzer
11. MetricsCollector

### 부가 클래스 (다이어그램에 언급됨)

1. DataValidator
2. DataNormalizer
3. DataSerializer
4. QueryBuilder
5. SpreadCalculator
6. MetricsStore
7. MetricsAggregator
8. RedisClient
9. PostgresClient
10. Logger

### 타입 정의

1. ConnectionStatus
2. CollectorConfig
3. CollectorState
4. CollectorMetrics
5. HealthStatus
6. CollectorStatus
7. ErrorType
8. CollectorError
9. ExchangeConfig
10. RawMarketData
11. ProcessedMarketData
12. AnalysisInput
13. AnalysisResult
14. DataQuery
