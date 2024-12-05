/**
 * File: src/tests/ExchangeCollector.test.ts
 * Description: ExchangeCollector 클래스의 기능 테스트
 */

import { ExchangeCollector } from "../src/collectors/ExchangeCollector"
import { BinanceAdapter } from "../src/adapters/BinanceAdapter"
import { WebSocketConfig } from "../src/exchanges/WebSocketConnectionConfig"

describe("ExchangeCollector 테스트", () => {
    let exchangeCollector: ExchangeCollector
    let binanceAdapter: BinanceAdapter

    beforeEach(() => {
        const symbols = ["btcusdt", "ethusdt", "bchusdt", "xrpusdt", "eosusdt"]
        binanceAdapter = new BinanceAdapter()
        exchangeCollector = new ExchangeCollector(binanceAdapter, symbols)

        const config: WebSocketConfig = {
            connectionDurationLimit: 86_400_000, // 24시간
            pingInterval: 300_000, // 5분
            pongTimeout: 900_000, // 15분
            messageRateLimit: 10, // 10 메시지/초
            streamLimitPerConnection: 2, // 제한 변경
            url: "http://localhost:8080",
            wsUrl: "ws://localhost:8081",
            // wsUrl: "wss://stream.binance.com:9443/ws",
        }
        jest.spyOn(binanceAdapter, "getWebSocketConfig").mockReturnValue(config)
    })

    afterEach(async () => {
        if (exchangeCollector) {
            await exchangeCollector.stop() // WebSocket 연결 및 타이머 정리
        }
        jest.clearAllTimers() // Jest 타이머 초기화
    })

    it("WebSocket 설정에 따른 그룹화 테스트", async () => {
        const groupedSymbols = Reflect.get(
            exchangeCollector,
            "groupedSymbols"
        ) as string[][]

        exchangeCollector.start()
        await new Promise((resolve) => setTimeout(resolve, 5000)) // 5초 대기

        // WebSocket 설정에 따라 그룹화가 올바른지 확인
        expect(groupedSymbols.length).toBe(3)
        expect(groupedSymbols[0]).toEqual(["BTCUSDT", "ETHUSDT"])
        expect(groupedSymbols[1]).toEqual(["BCHUSDT", "XRPUSDT"])
        expect(groupedSymbols[2]).toEqual(["EOSUSDT"])
    })
})
