// import { BinanceMockServer } from "./mock/binance/binance-mock-server"
import { ExchangeMarket } from "../src/managers/ExchangeMarket"
import { BinanceAdapter } from "../src/adapters/binance/BinanceAdapter"
import { Logger } from "../src/utils/logger"

describe("ExchangeMarket 통합 테스트 (BinanceMockServer)", () => {
    // let mockServer: BinanceMockServer
    let market: ExchangeMarket

    beforeAll(async () => {
        // Mock 서버 초기화 및 시작
        const port = 8080 // Example port number
        const wsPort = 8081 // Example WebSocket port number
        // mockServer = new BinanceMockServer(port, wsPort)
        // await mockServer.initialize()
        // mockServer.start()

        const config = {
            spot_ws_url: `ws://localhost:${wsPort}`,
            futures_ws_url: `ws://localhost:${wsPort}`,
            spot_api_url: `http://localhost:${port}/api/v3`,
            futures_api_url: `http://localhost:${port}/fapi/v1`,
        }

        market = new ExchangeMarket(
            "test-market",
            new BinanceAdapter(config),
            new BinanceAdapter(config),
            {
                publish: jest.fn(),
                subscribe: jest.fn(),
                unsubscribe: jest.fn(),
            },
            { changeState: jest.fn() },
            { collect: jest.fn() },
            { handleError: jest.fn() }
        )
    })

    afterAll(() => {
        // mockServer.stop()
    })

    it("ExchangeMarket 초기화 및 구독 대상 심볼 결정 테스트", async () => {
        await market.initialize()
        const targets = market.getSubscriptionTargets()
        Logger.getInstance("ExchangeMarket").info(
            `Subscription targets: ${targets.length}`
        )
        expect(targets).toEqual(expect.arrayContaining(["BTCUSDT", "ETHUSDT"]))
        expect(market.getState()).toBe("READY")
    })

    it("ExchangeMarket 시작 및 Collector 구독 테스트", async () => {
        await market.start()
        const state = market.getState()

        // 상태 확인
        expect(state).toBe("RUNNING")

        // Spot 및 Futures 구독 상태 확인
        const targets = market.getSubscriptionTargets()
        expect(targets).toContain("BTCUSDT")
        expect(targets).toContain("ETHUSDT")
        expect(targets).toContain("BTCUSDT")
        // 기다리는 동안 데이터 수집 확인
        await new Promise((resolve) => setTimeout(resolve, 60000))
    })

    // it("ExchangeMarket 구독 해제 테스트", async () => {
    //     await market.start()

    //     const spotCollector = market.getSpotCollector()
    //     const futuresCollector = market.getFuturesCollector()

    //     // 구독 해제 요청
    //     await spotCollector?.unsubscribe(["BTCUSDT"])
    //     await futuresCollector?.unsubscribe(["BTCUSDT"])

    //     const spotSubscriptions = spotCollector?.getSubscriptions()
    //     const futuresSubscriptions = futuresCollector?.getSubscriptions()

    //     // 구독 해제 결과 확인
    //     expect(spotSubscriptions).not.toContain("BTCUSDT")
    //     expect(futuresSubscriptions).not.toContain("BTCUSDT")
    // })
})
