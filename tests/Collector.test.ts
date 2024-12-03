// tests/Collector.test.ts
import { jest } from "@jest/globals"
import Collector from "../src/components/Collector"
import { EventManagerInterface } from "../src/interfaces/EventManagerInterface"
import { StateManagerInterface } from "../src/interfaces/StateManagerInterface"
import { MetricManagerInterface } from "../src/interfaces/MetricManagerInterface"
import { ErrorManagerInterface } from "../src/interfaces/ErrorManagerInterface"

describe("Collector 테스트 (실제 WebSocket 서버)", () => {
    let collector: Collector
    let mockEventManager: jest.Mocked<EventManagerInterface>
    let mockStateManager: jest.Mocked<StateManagerInterface>
    let mockMetricManager: jest.Mocked<MetricManagerInterface>
    let mockErrorManager: jest.Mocked<ErrorManagerInterface>

    beforeEach(() => {
        mockEventManager = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
        }
        mockStateManager = { changeState: jest.fn() }
        mockMetricManager = { collect: jest.fn() }
        mockErrorManager = { handleError: jest.fn() }

        const config = {
            id: "test-collector",
            exchangeId: "test-exchange",
            websocketUrl: "ws://localhost:8080", // 실제 WebSocket 서버 URL
            wsConfig: {
                maxReconnectAttempts: 5,
                reconnectInterval: 1000,
                pingInterval: 5000,
                pongTimeout: 5000,
            },
            bufferConfig: {
                maxSize: 1000,
                flushThreshold: 80,
                flushInterval: 1000,
            },
            retryPolicy: {
                maxRetries: 3,
                retryInterval: 5000,
                backoffRate: 2,
            },
        }

        collector = new Collector(
            config as any,
            mockEventManager,
            mockStateManager,
            mockMetricManager,
            mockErrorManager
        )
    })

    afterEach(async () => {
        await collector.stop()
        jest.restoreAllMocks()
    })

    it("Collector 시작 테스트", async () => {
        await collector.start()
        expect(mockStateManager.changeState).toHaveBeenCalledWith(
            "test-collector",
            "STARTING"
        )
        expect(mockStateManager.changeState).toHaveBeenCalledWith(
            "test-collector",
            "RUNNING"
        )
    })

    it("WebSocket 연결 종료 시 재연결 시도를 해야 합니다", async () => {
        await collector.start()
        const ws = collector["ws"]
        ws?.close()

        expect(mockStateManager.changeState).toHaveBeenCalledWith(
            "test-collector",
            "RUNNING"
        )
        expect(mockEventManager.publish).not.toHaveBeenCalled()
    })
})
