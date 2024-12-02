/**
 * 파일 경로: tests/Collector.test.ts
 *
 * 개요:
 * - Collector 클래스의 주요 기능 테스트
 * - WebSocket 연결 및 복구
 * - REST API 대체 동작
 * - 데이터 처리 및 상태 관리 검증
 */

import Collector from "../src/components/Collector"
import WebSocket from "ws"
import axios from "axios"
import { jest } from "@jest/globals"

jest.mock("ws") // WebSocket 모의 객체(Mock) 사용
jest.mock("axios") // Axios 모의 객체(Mock) 사용

describe("Collector 클래스 테스트", () => {
    let collector: Collector

    beforeEach(() => {
        // Jest 타이머 모킹 활성화
        jest.useFakeTimers()

        // Mock Config
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
                maxRetries: 30000,
            },
        }

        // Collector 인스턴스 생성
        collector = new Collector(mockConfig as any)
    })

    afterEach(() => {
        jest.clearAllMocks() // 모든 Jest 모킹 초기화
        jest.restoreAllMocks() // 모든 스파이 복구
        jest.useRealTimers() // 타이머를 실제 시간으로 복구
    })

    describe("WebSocket 연결", () => {
        test("WebSocket 연결 성공", async () => {
            const mockOpen = jest.fn()
            ;(WebSocket as any).mockImplementation(() => ({
                on: jest.fn((event: string, cb: Function) => {
                    if (event === "open") {
                        mockOpen()
                        cb()
                    }
                }),
            }))

            await collector["connect"]()
            expect(mockOpen).toHaveBeenCalled()
        })

        test("WebSocket 연결 실패 시 복구 시도", async () => {
            const mockClose = jest.fn()
            ;(WebSocket as any).mockImplementation(() => ({
                on: jest.fn((event: string, cb: Function) => {
                    if (event === "close") {
                        mockClose()
                        cb()
                    }
                }),
            }))

            await collector["handleConnectionClose"]()
            expect(mockClose).toHaveBeenCalled()
            expect(collector["reconnectAttempts"]).toBeGreaterThan(0)
        })
    })

    describe("REST API 대체 수집", () => {
        describe("REST API 대체 수집", () => {
            test("REST API 데이터 호출 성공", async () => {
                const mockData = [{ symbol: "BTC/USD", timestamp: 123456789 }]
                ;(
                    axios.get as jest.MockedFunction<typeof axios.get>
                ).mockResolvedValueOnce({ data: mockData })

                const result = await collector["fetchMarketDataViaRest"]()
                expect(result).toEqual(mockData)
                expect(axios.get).toHaveBeenCalledWith(
                    "wss://mock.websocket.url/api/market-data"
                )
            })
        })

        test("REST API 호출 실패 시 에러 처리", async () => {
            // Mock axios.get to reject with an error
            ;(
                axios.get as jest.MockedFunction<typeof axios.get>
            ).mockRejectedValueOnce(new Error("Network error"))

            await expect(collector["fetchMarketDataViaRest"]()).rejects.toThrow(
                "Network error"
            )
            expect(axios.get).toHaveBeenCalledWith(
                "wss://mock.websocket.url/api/market-data"
            )
        })
    })

    describe("데이터 처리", () => {
        test("올바른 데이터 처리", async () => {
            const mockBufferPush = jest.spyOn(collector["dataBuffer"], "push")
            const validData = { symbol: "BTC/USD", timestamp: 123456789 }

            collector["validateData"] = jest.fn(() => true)
            await collector["handleMessage"](JSON.stringify(validData))

            expect(mockBufferPush).toHaveBeenCalledWith(validData)
        })

        test("유효하지 않은 데이터 무시", async () => {
            const mockLogger = jest.spyOn(collector["logger"], "warn")
            const invalidData = { symbol: 12345, timestamp: "not-a-number" }

            collector["validateData"] = jest.fn(() => false)
            await collector["handleMessage"](JSON.stringify(invalidData))

            expect(mockLogger).toHaveBeenCalledWith(
                expect.stringContaining("데이터 검증 실패")
            )
        })
    })

    describe("상태 관리 및 메트릭 수집", () => {
        test("Collector 상태 변경 호출", async () => {
            const mockChangeState = collector["stateManager"]
                .changeState as jest.Mock

            await collector["start"]()
            expect(mockChangeState).toHaveBeenCalledWith(
                "test-collector",
                "STARTING"
            )
            expect(mockChangeState).toHaveBeenCalledWith(
                "test-collector",
                "RUNNING"
            )
        })

        test("메트릭 수집", async () => {
            const mockCollect = collector["metricManager"].collect as jest.Mock

            collector["startMetricCollection"]()
            jest.advanceTimersByTime(5000) // Mock 타이머 진행

            expect(mockCollect).toHaveBeenCalledWith(
                expect.objectContaining({ name: "collector_metrics" })
            )
        })
    })
})
