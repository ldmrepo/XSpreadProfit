/**
 * Path: tests/exchange/ExchangeConnector.test.ts
 * ExchangeConnector와 WebSocketManager 연계 테스트
 */

import { ExchangeConnector } from "../../src-dev/collectors/ExchangeConnector"
import { MockWebSocketClient } from "../websocket/MockWebSocketClient"
import { WebSocketManager } from "../../src-dev/websocket/WebSocketManager"
import { ConnectorState } from "../../src-dev/states/types"

describe("ExchangeConnector", () => {
    let mockClient: MockWebSocketClient
    let wsManager: WebSocketManager
    let connector: ExchangeConnector

    beforeEach(() => {
        mockClient = new MockWebSocketClient()
        wsManager = new WebSocketManager(mockClient, {
            url: "ws://mock",
            reconnectOptions: { maxAttempts: 3, delay: 1000 },
        })
        connector = new ExchangeConnector(
            "mockConnector",
            ["BTC/USD"],
            wsManager
        )
    })

    afterEach(() => {
        mockClient.cleanup() // Mock 클라이언트 정리
    })
    test("MockWebSocketClient emits events correctly", () => {
        const mockClient = new MockWebSocketClient()

        const mockHandler = jest.fn()
        mockClient.on("error", mockHandler)

        const testError = new Error("Test error")
        mockClient.emit("error", testError)

        expect(mockHandler).toHaveBeenCalledWith(testError)
    })

    test("successfully starts and subscribes to symbols", async () => {
        let connected = false
        let subscribed = false

        connector.on("stateChange", (event) => {
            console.log("State changed:", event) // 상태 변경 로그
            if (event.currentState === ConnectorState.SUBSCRIBED) {
                subscribed = true
            }
        })

        wsManager.on("connected", () => {
            console.log("WebSocket connected") // 연결 로그
            connected = true
        })

        await connector.start()
        expect(connected).toBe(true)
        expect(subscribed).toBe(true)
        expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED)
    })

    test("handles WebSocketManager errors and transitions to error state", async () => {
        let errorHandled = false

        connector.on("error", () => {
            errorHandled = true
        })

        wsManager.on("connected", () => {
            mockClient.emit("error", new Error("Simulated WebSocket error"))
        })

        try {
            await connector.start()
        } catch (error) {
            expect(errorHandled).toBe(true)
            expect(connector.getState()).toBe(ConnectorState.ERROR)
        }
    })

    test("successfully disconnects", async () => {
        let disconnected = false

        connector.on("stateChange", (event) => {
            if (event.currentState === ConnectorState.DISCONNECTED) {
                disconnected = true
            }
        })

        await connector.start()
        await connector.stop()

        expect(disconnected).toBe(true)
        expect(connector.getState()).toBe(ConnectorState.DISCONNECTED)
    })
})
