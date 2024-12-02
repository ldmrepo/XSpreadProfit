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
            on: jest.fn((event: string, callback: (data?: any) => void) => {
                if (event === "open") {
                    callback() // WebSocket 연결
                }
                if (event === "message") {
                    callback(
                        JSON.stringify({
                            symbol: "BTC/USD",
                            timestamp: 123456789,
                        })
                    ) // 메시지 이벤트 호출
                }
            }),
            send: jest.fn(),
            close: jest.fn(),
            ping: jest.fn(),
            readyState: WebSocket.OPEN,
        }
        jest.spyOn(WebSocket.prototype, "on").mockImplementation(
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

        // WebSocket 닫기
        if (collector) {
            collector.stop()
        }
    })

    describe("WebSocket 연결", () => {
        test("WebSocket 연결 성공", async () => {
            const mockChangeState = collector["stateManager"]
                .changeState as jest.Mock

            const mockWs = {
                on: jest.fn((event: string, callback: (data?: any) => void) => {
                    if (event === "open") callback() // WebSocket 연결 즉시 open 상태로 설정
                }),
                send: jest.fn(),
                close: jest.fn(),
                ping: jest.fn(),
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

        test("WebSocket 연결 실패 시 복구 시도", async () => {
            const mockChangeState = collector["stateManager"]
                .changeState as jest.Mock

            const mockWs = {
                on: jest.fn((event: string, callback: (data?: any) => void) => {
                    if (event === "close") callback() // WebSocket 닫힘 상태 트리거
                }),
                close: jest.fn(),
                readyState: WebSocket.CLOSED,
            }

            WebSocket.prototype.constructor = jest.fn(
                () => mockWs as unknown as WebSocket
            )

            const reconnectSpy = jest
                .spyOn(collector as any, "connect")
                .mockImplementation(jest.fn())

            await collector.start()

            jest.advanceTimersByTime(1000) // Reconnect 시도 시간 경과

            expect(reconnectSpy).toHaveBeenCalled()
            expect(mockChangeState).toHaveBeenCalledWith(
                "test-collector",
                "STARTING"
            )
        })
    })

    describe("REST API 대체 수집", () => {
        test("REST API 데이터 호출 성공", async () => {
            const mockData = [{ symbol: "BTC/USD", timestamp: 123456789 }]
            ;(
                axios.get as jest.MockedFunction<typeof axios.get>
            ).mockResolvedValueOnce({ data: mockData })

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

        test("REST API 호출 실패 시 에러 처리", async () => {
            jest.spyOn(console, "warn").mockImplementation(() => {}) // 경고 로그 무시
            ;(
                axios.get as jest.MockedFunction<typeof axios.get>
            ).mockRejectedValueOnce(new Error("Network error"))

            const fetchDataSpy = jest.spyOn(
                collector as any,
                "fetchMarketDataViaRest"
            )
            const handleErrorSpy = collector["errorManager"]
                .handleError as jest.Mock

            collector["startRestFallback"]()

            jest.advanceTimersByTime(5000) // REST 호출 주기

            expect(fetchDataSpy).toHaveBeenCalled()
            expect(handleErrorSpy).toHaveBeenCalledWith(
                expect.objectContaining({ message: "REST API 호출 실패" })
            )
        })
    })

    describe("데이터 처리", () => {
        test("올바른 데이터 처리", async () => {
            await collector.subscribe(["BTC/USD"]) // 심볼 등록

            const validData = { symbol: "BTC/USD", timestamp: 123456789 }
            const bufferPushSpy = jest.spyOn(collector["dataBuffer"], "push")

            await collector["handleMessage"](JSON.stringify(validData))

            expect(bufferPushSpy).toHaveBeenCalledWith(validData)
        })

        test("유효하지 않은 데이터 무시", async () => {
            const invalidData = { symbol: 12345, timestamp: "not-a-number" }

            const mockLogger = jest
                .spyOn(console, "warn")
                .mockImplementation(() => {})

            await collector["handleMessage"](JSON.stringify(invalidData))

            expect(mockLogger).toHaveBeenCalledWith(
                expect.stringContaining("데이터 검증 실패"),
                invalidData
            )
        })
    })

    describe("상태 관리 및 메트릭 수집", () => {
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
    })
})
