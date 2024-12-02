/**
 * Collector 클래스 테스트
 *
 * WebSocket 연결 관리, REST API 대체 수집, 데이터 처리 및 메트릭 수집 기능을 테스트합니다.
 */

import Collector from "../src/components/Collector"
import WebSocket from "ws"
import axios from "axios"
import { jest } from "@jest/globals"

jest.mock("ws")
jest.mock("axios")

describe("Collector 클래스 테스트", () => {
    let collector: Collector

    beforeEach(async () => {
        const mockConfig = {
            id: "test-collector",
            exchangeId: "test-exchange",
            websocketUrl: "wss://mock.websocket.url",
            managers: {
                eventManager: { publish: jest.fn() },
                stateManager: { changeState: jest.fn() },
                metricManager: { collect: jest.fn() },
                errorManager: { handleError: jest.fn() },
            },
            wsConfig: {
                maxReconnectAttempts: 5,
                reconnectInterval: 1000,
                pingInterval: 30000,
            },
            bufferConfig: {
                maxSize: 1000,
                flushInterval: 5000,
            },
            retryPolicy: {
                retryInterval: 5000,
                maxRetries: 3,
            },
        }

        collector = new Collector(mockConfig as any)

        // WebSocket 모킹
        const mockWs = {
            on: jest.fn((event: string, callback: (data?: string) => void) => {
                if (event === "open") {
                    setTimeout(() => callback(), 100) // "open" 이벤트 트리거
                }
                if (event === "message") {
                    setTimeout(
                        () =>
                            callback(
                                JSON.stringify({
                                    symbol: "BTC/USD",
                                    timestamp: 123456789,
                                })
                            ),
                        200
                    )
                }
            }),
            send: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN,
        }
        WebSocket.prototype.constructor = jest.fn(
            () => mockWs as unknown as WebSocket
        )

        // REST API 모킹
        ;(axios.get as jest.MockedFunction<typeof axios.get>).mockResolvedValue(
            {
                data: [{ symbol: "BTC/USD", timestamp: 123456789 }],
            }
        )

        await collector.start()
    })

    afterEach(() => {
        jest.clearAllMocks()
        jest.useRealTimers() // Fake Timers 복구
        collector.stop() // Collector 종료
    })

    test("WebSocket 연결 성공", async () => {
        const mockChangeState = collector["stateManager"]
            .changeState as jest.Mock

        const mockWs = {
            on: jest.fn((event: string, callback: (data?: any) => void) => {
                if (event === "open") callback()
            }),
            send: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN,
        }
        WebSocket.prototype.constructor = jest.fn(
            () => mockWs as unknown as WebSocket
        )

        await collector.start()

        expect(mockChangeState).toHaveBeenCalledWith(
            "test-collector",
            "STARTING"
        )
        expect(mockChangeState).toHaveBeenCalledWith(
            "test-collector",
            "RUNNING"
        )
        expect(mockWs.on).toHaveBeenCalledWith("open", expect.any(Function))
    })

    test("REST API 데이터 호출 성공", async () => {
        const mockData = [{ symbol: "BTC/USD", timestamp: 123456789 }]
        ;(
            axios.get as jest.MockedFunction<typeof axios.get>
        ).mockResolvedValueOnce({
            data: mockData,
        })

        const fetchDataSpy = jest.spyOn(
            collector as any,
            "fetchMarketDataViaRest"
        )
        const bufferPushSpy = jest.spyOn(collector["dataBuffer"], "push")

        collector["startRestFallback"]()

        jest.advanceTimersByTime(5000) // REST 호출 주기

        expect(fetchDataSpy).toHaveBeenCalled()
        expect(bufferPushSpy).toHaveBeenCalledWith(mockData[0])
    })

    test("올바른 데이터 처리", async () => {
        await collector.subscribe(["BTC/USD"]) // 심볼 등록

        const validData = { symbol: "BTC/USD", timestamp: 123456789 }
        const bufferPushSpy = jest.spyOn(collector["dataBuffer"], "push")

        await collector["handleMessage"](JSON.stringify(validData))

        expect(bufferPushSpy).toHaveBeenCalledWith(validData)
    })

    test("Collector 상태 변경 호출", async () => {
        const mockChangeState = collector["stateManager"]
            .changeState as jest.Mock

        await collector.start()

        expect(mockChangeState).toHaveBeenCalledWith(
            "test-collector",
            "STARTING"
        )
        expect(mockChangeState).toHaveBeenCalledWith(
            "test-collector",
            "RUNNING"
        )
    })

    test("메트릭 수집", () => {
        const mockCollect = collector["metricManager"].collect as jest.Mock

        collector["startMetricCollection"]()

        jest.advanceTimersByTime(5000) // 타이머를 5초 앞으로 이동

        expect(mockCollect).toHaveBeenCalledWith(
            expect.objectContaining({ name: "collector_metrics" })
        )
    })
    test("WebSocket message 이벤트 처리", async () => {
        const validData = { symbol: "BTC/USD", timestamp: 123456789 }
        const mockHandleMessage = jest.spyOn(collector as any, "handleMessage")

        // 메시지 이벤트 트리거
        const mockWs = collector["ws"] as any
        mockWs.on.mock.calls.find((call: any[]) => call[0] === "message")[1](
            JSON.stringify(validData)
        )

        expect(mockHandleMessage).toHaveBeenCalledWith(
            JSON.stringify(validData)
        )
    })
})
