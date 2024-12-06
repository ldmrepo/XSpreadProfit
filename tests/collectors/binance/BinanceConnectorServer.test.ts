/**
 * Path: tests/collectors/binance/BinanceConnectorServer.test.ts
 * Binance WebSocket 서버 실사용 테스트
 */

import { BinanceConnector } from "../../../src-dev/exchanges/binance/BinanceConnector"
import { WebSocketManager } from "../../../src-dev/websocket/WebSocketManager"
import { ConnectorState } from "../../../src-dev/states/types"
import { WebSocketClient } from "../../../src-dev/websocket/WebSocketClient"

describe("Binance WebSocket 실제 서버 테스트", () => {
    let connector: BinanceConnector
    let wsManager: WebSocketManager
    const testSymbols = ["BTCUSDT", "ETHUSDT"] // 테스트 심볼
    const binanceUrl = "ws://localhost:8081" // "wss://stream.binance.com:9443/ws" // Binance WebSocket URL

    beforeEach(() => {
        wsManager = new WebSocketManager(
            new WebSocketClient(), // 실제 WebSocket 객체 사용
            { url: binanceUrl }
        )
        connector = new BinanceConnector(
            "test-connector",
            testSymbols,
            wsManager
        )
    })

    afterEach(async () => {
        // 테스트 후 WebSocket 연결 종료
        await connector.stop()
    })

    it("Binance WebSocket 연결 및 메시지 수신", async () => {
        const startPromise = connector.start() // WebSocket 연결 시작

        // 연결 성공 대기
        await startPromise
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED)

        // 구독 메시지가 서버로 전송되었는지 확인
        expect(connector).toBeTruthy() // WebSocket 상태가 정상인지 확인

        // 메시지 수신 대기
        await new Promise<void>((resolve) => {
            connector.on("message", (msg) => {
                console.log("Message received from Binance:", msg)
                resolve() // 첫 메시지 수신 후 테스트 종료
            })
        })
    })

    it("Binance WebSocket 재연결 테스트", async () => {
        const startPromise = connector.start() // WebSocket 연결 시작

        // 연결 성공 대기
        await startPromise
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED)
        // 지연을 위해 1초 대기
        await new Promise((resolve) => setTimeout(resolve, 10000))

        // WebSocket을 강제로 종료하여 재연결 동작 확인
        await wsManager.disconnect()

        // 재연결이 정상적으로 이루어지는지 확인
        await new Promise<void>((resolve) => {
            connector.on("connected", () => {
                console.log("Reconnected to Binance WebSocket")
                resolve()
            })
        })

        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED)
    })
})
