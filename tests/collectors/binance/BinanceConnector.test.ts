/**
 * Path: src/exchanges/binance/__tests__/BinanceConnector.test.ts
 * 바이낸스 커넥터 테스트
 */
import { BinanceConnector } from "../../../src-dev/exchanges/binance/BinanceConnector"
import { WebSocketManager } from "../../../src-dev//websocket/WebSocketManager"
import { ConnectorState } from "../../../src-dev//states/types"
import { WebSocketError, ErrorCode } from "../../../src-dev/errors/types"
import { MockWebSocketClient } from "../../websocket/MockWebSocketClient"
import { WebSocketConfig } from "../../../src-dev/websocket/types"
import { BinanceRawMessage } from "../../../src-dev/exchanges/binance/types"

// WebSocketManager 목 구현
class MockWebSocketManager extends WebSocketManager {
    connected = false
    messageCallback: ((data: unknown) => void) | null = null

    constructor() {
        const mockClient = new MockWebSocketClient()
        const config: WebSocketConfig = {
            url: "wss://test.com",
            options: {
                timeout: 1000,
            },
        }
        super(mockClient, config)
    }

    async disconnect(): Promise<void> {
        this.connected = false
        this.emit("disconnected")
    }

    send(data: unknown): void {
        if (!this.connected) {
            throw new WebSocketError(
                ErrorCode.SEND_FAILED,
                "WebSocket is not connected"
            )
        }
    }

    // 테스트용 메시지 시뮬레이션
    simulateMessage(data: BinanceRawMessage): void {
        console.log("Simulating message:", data)
        if (!this.isValidMockMessage(data)) {
            throw new Error("Invalid mock message format")
        }
        this.emit("message", data)
    }

    private isValidMockMessage(data: unknown): data is BinanceRawMessage {
        return (
            typeof data === "object" &&
            data !== null &&
            "e" in data &&
            "s" in data &&
            "E" in data
        )
    }
}

describe("BinanceConnector", () => {
    let connector: BinanceConnector
    let mockClient: MockWebSocketClient
    let wsManager: WebSocketManager
    const testSymbols = ["BTCUSDT", "ETHUSDT"]

    beforeEach(() => {
        mockClient = new MockWebSocketClient()
        wsManager = new WebSocketManager(mockClient, {
            url: "wss://test.binance.com/ws",
            // url: "ws://localhost:8081",
            options: { timeout: 1000 },
        })
        connector = new BinanceConnector(
            "test-connector",
            testSymbols,
            wsManager
        )
    })

    afterEach(() => {
        mockClient.cleanup()
    })

    describe("연결 관리", () => {
        it("정상적으로 연결되어야 함", async () => {
            const startPromise = connector.start()
            mockClient.emit("open")
            await startPromise
            expect(connector.getState()).toBe(ConnectorState.SUBSCRIBED)
        })

        it("연결 실패시 에러를 발생시키고 ERROR 상태가 되어야 함", async () => {
            let errorReceived = false

            // 에러 핸들러 설정
            connector.on("error", (error: WebSocketError) => {
                expect(error).toBeInstanceOf(WebSocketError)
                expect(error.code).toBe(ErrorCode.CONNECTION_FAILED)
                errorReceived = true
            })

            // start() 호출
            const connectPromise = connector.start()

            // WebSocket 에러 이벤트 발생
            mockClient.emit(
                "error",
                new WebSocketError(
                    ErrorCode.CONNECTION_FAILED,
                    "Connection failed"
                )
            )

            // Promise rejection 확인
            await expect(connectPromise).rejects.toThrow("Connection failed")
            expect(errorReceived).toBe(true)
            expect(connector.getState()).toBe(ConnectorState.ERROR)
        })
    })
})
