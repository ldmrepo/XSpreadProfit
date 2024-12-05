/**
 * File: src/tests/ExchangeCollector.test.ts
 * Description: ExchangeCollector 클래스의 기능 테스트
 */

import { ExchangeCollector } from "../src/collectors/ExchangeCollector"
import { BinanceAdapter } from "../src/adapters/BinanceAdapter"
import { ExchangeCoinRegistry } from "../src/models/ExchangeCoinRegistry"
import { CollectorMetrics } from "../src/types/metrics"
import { ExchangeConnector } from "../src/collectors/ExchangeConnector"
import { WebSocketConfig } from "../src/exchanges/WebSocketConnectionConfig"

describe("ExchangeCollector 테스트", () => {
    let binanceAdapter: BinanceAdapter
    let exchangeCollector: ExchangeCollector

    beforeEach(() => {
        binanceAdapter = new BinanceAdapter()
    })
    afterEach(() => {
        exchangeCollector.stop()
        jest.clearAllMocks()
    })

    it("ExchangeCollector 생성 시 레지스트리 초기화 및 그룹화 테스트", () => {
        const symbols = Array.from({ length: 250 }, (_, i) => `COIN-${i}`)
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const groupedSymbols = Reflect.get(
            exchangeCollector,
            "groupedSymbols"
        ) as string[][]
        const exchangeConnectors = Reflect.get(
            exchangeCollector,
            "exchangeConnector"
        ) as ExchangeConnector[]

        const config = binanceAdapter.getWebSocketConfig()
        const expectedGroups = Math.ceil(
            symbols.length / config.streamLimitPerConnection
        )

        // 그룹화된 코인 심볼 확인
        expect(groupedSymbols.length).toBe(expectedGroups)
        groupedSymbols.forEach((group) => {
            expect(group.length).toBeLessThanOrEqual(
                config.streamLimitPerConnection
            )
        })

        // ExchangeConnector 생성 확인
        expect(exchangeConnectors.length).toBe(expectedGroups)
    })

    it("WebSocket 설정에 따른 그룹화 테스트", () => {
        const symbols = ["BTCUSDT", "ETHUSDT", "BCHUSDT", "XRPUSDT", "EOSUSDT"]

        // WebSocket 설정 변경 (방법 1: 전체 정의)
        const config: WebSocketConfig = {
            connectionDurationLimit: 86_400_000, // 24시간
            pingInterval: 300_000, // 5분
            pongTimeout: 900_000, // 15분
            messageRateLimit: 10, // 10 메시지/초
            streamLimitPerConnection: 2, // 제한 변경
            url: "ws://localhost:8081",
            // url: "wss://stream.binance.com:9443/ws/",
        }
        jest.spyOn(binanceAdapter, "getWebSocketConfig").mockReturnValue(config)

        // ExchangeCollector 초기화
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const groupedSymbols = Reflect.get(
            exchangeCollector,
            "groupedSymbols"
        ) as string[][]

        // WebSocket 설정에 따라 그룹화가 올바른지 확인
        expect(groupedSymbols.length).toBe(3)
        expect(groupedSymbols[0]).toEqual(["BTCUSDT", "ETHUSDT"])
        expect(groupedSymbols[1]).toEqual(["BCHUSDT", "XRPUSDT"])
        expect(groupedSymbols[2]).toEqual(["EOSUSDT"])
    })

    it("WebSocket 설정과 연결 제한 테스트", () => {
        const symbols = Array.from({ length: 250 }, (_, i) => `COIN-${i}`)
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        // groupedSymbols를 Reflect API로 접근
        const groupedSymbols = Reflect.get(
            exchangeCollector,
            "groupedSymbols"
        ) as string[]
        const config = binanceAdapter.getWebSocketConfig()
        const expectedLimit = config.streamLimitPerConnection

        expect(groupedSymbols.length).toBeGreaterThan(0)
        expect(groupedSymbols.length).toBeLessThanOrEqual(expectedLimit)
    })

    it("대상 코인 추가 확인", () => {
        const symbols = ["BTC-USDT"]
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const registry = Reflect.get(
            exchangeCollector,
            "exchangeCoinRegistry"
        ) as ExchangeCoinRegistry
        const coin = registry.getCoin("BTC-USDT", "SPOT")

        expect(coin).not.toBeUndefined()
        expect(coin?.collectState).toBe("READY")
    })

    it("레지스트리의 WebSocket 설정 출력 확인", () => {
        const consoleSpy = jest.spyOn(console, "log").mockImplementation()
        const symbols = ["BTC-USDT", "ETH-USDT"]
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        expect(consoleSpy).toHaveBeenCalledWith(
            `[ExchangeCollector] Binance WebSocket 설정:`,
            binanceAdapter.getWebSocketConfig()
        )
        consoleSpy.mockRestore()
    })

    it("ExchangeCollector 메트릭스 업데이트 확인", () => {
        const symbols = Array.from({ length: 10 }, (_, i) => `COIN-${i}`)
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const config = binanceAdapter.getWebSocketConfig()
        const expectedGroupedCount = Math.ceil(
            symbols.length / config.streamLimitPerConnection
        )

        const metrics = exchangeCollector.getMetrics()

        expect(metrics.totalSymbols).toBe(symbols.length)
        expect(metrics.groupedSymbolCount).toBe(expectedGroupedCount)
        expect(metrics.connectorCount).toBe(expectedGroupedCount)
    })
    it("빈 심볼 목록에 대한 메트릭스 확인", () => {
        const symbols: string[] = []
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const metrics = exchangeCollector.getMetrics()

        // 반환된 메트릭스 값 확인
        expect(metrics.totalSymbols).toBe(0)
        expect(metrics.timestamp).toBeLessThanOrEqual(Date.now())
    })
})
