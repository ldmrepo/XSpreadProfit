#!/bin/bash

# Create root directory
mkdir -p src

# Create main subdirectories
cd src
mkdir -p collectors processors interfaces analyzers storage metrics factories types

# Create collector files
cd collectors
touch BaseCollector.ts BinanceCollector.ts BybitCollector.ts
cd ..

# Create processor files
cd processors
touch BaseDataProcessor.ts BinanceDataProcessor.ts DataValidator.ts DataNormalizer.ts
cd ..

# Create interface files
cd interfaces
touch MarketConnector.ts DataProcessor.ts DataStore.ts PriceAnalyzer.ts Logger.ts
cd ..

# Create analyzer files
cd analyzers
touch InternalPriceAnalyzer.ts CrossExchangePriceAnalyzer.ts SpreadCalculator.ts
cd ..

# Create storage files
cd storage
touch RedisStore.ts PostgresStore.ts DataSerializer.ts QueryBuilder.ts MetricsStore.ts
cd ..

# Create metrics files
cd metrics
touch MetricsCollector.ts MetricsAggregator.ts
cd ..

# Create factory files
cd factories
touch ExchangeCollectorFactory.ts
cd ..

# Create types files
cd types
touch Status.ts Config.ts MarketData.ts
cd ..

# Create root level files
touch config.ts app.ts