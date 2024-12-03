// tests/StateManager.test.ts
import { jest } from "@jest/globals"
import StateManager from "../src/managers/StateManager"
import EventManager from "../src/managers/EventManager"
import { Logger } from "../src/utils/logger"

describe("StateManager", () => {
    let stateManager: StateManager
    let mockEventManager: EventManager

    beforeEach(async () => {
        // StateManager 싱글톤 인스턴스 재설정
        ;(StateManager as any).instance = null
        ;(EventManager as any).instance = null

        const eventManagerImpl = {
            initialize: jest.fn().mockReturnValue(Promise.resolve()),
            publish: jest.fn().mockReturnValue(Promise.resolve()),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({
                eventsProcessed: 0,
                eventsFailed: 0,
                averageProcessingTime: 0,
            }),
            subscribers: new Map(),
            eventTypes: new Map(),
            metrics: {
                eventsProcessed: 0,
                eventsFailed: 0,
                averageProcessingTime: 0,
            },
            logger: {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as unknown as Logger,
            retryPolicy: {
                maxRetries: 3,
                retryInterval: 1000,
                backoffRate: 2,
            },
        }

        mockEventManager = eventManagerImpl as unknown as EventManager
        jest.spyOn(EventManager, "getInstance").mockImplementation(
            () => mockEventManager
        )

        stateManager = StateManager.getInstance()
        await stateManager.initialize({
            stateHistoryLimit: 100,
            validationEnabled: true,
            stateChangeTimeout: 5000,
        })
    })

    afterEach(() => {
        jest.clearAllMocks()
        jest.restoreAllMocks()
        ;(StateManager as any).instance = null
        ;(EventManager as any).instance = null
    })

    describe("상태 변경", () => {
        test("유효한 상태 전이를 허용해야 함", async () => {
            const componentId = "test-component"

            await stateManager.changeState(componentId, "STARTING")
            let state = stateManager.getState(componentId)
            expect(state?.state).toBe("STARTING")

            await stateManager.changeState(componentId, "RUNNING")
            state = stateManager.getState(componentId)
            expect(state?.state).toBe("RUNNING")
        })

        test("잘못된 상태 전이를 거부해야 함", async () => {
            const componentId = "test-component"
            await stateManager.changeState(componentId, "STARTING")

            await expect(
                stateManager.changeState(componentId, "STOPPED")
            ).rejects.toThrow("Invalid state transition")
        })

        test("상태 변경 시 이벤트를 발행해야 함", async () => {
            const componentId = "test-component"
            await stateManager.changeState(componentId, "STARTING")

            expect(mockEventManager.publish).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "SYSTEM.STATE_CHANGE",
                    payload: expect.objectContaining({
                        componentId,
                        state: "STARTING",
                    }),
                })
            )
        })
    })

    describe("상태 이력", () => {
        test("상태 변경 이력을 기록해야 함", async () => {
            const componentId = "test-component"

            await stateManager.changeState(componentId, "STARTING")
            await stateManager.changeState(componentId, "RUNNING")
            await stateManager.changeState(componentId, "PAUSED")

            const history = stateManager.getStateHistory(componentId)
            expect(history).toHaveLength(3)
            expect(history[0].state).toBe("STARTING")
            expect(history[1].state).toBe("RUNNING")
            expect(history[2].state).toBe("PAUSED")
        })

        test("이력이 제한 크기를 초과하지 않아야 함", async () => {
            const componentId = "test-component"

            await stateManager.changeState(componentId, "STARTING")
            await stateManager.changeState(componentId, "RUNNING")

            for (let i = 0; i < 99; i++) {
                await stateManager.changeState(componentId, "PAUSED")
                await stateManager.changeState(componentId, "RUNNING")
            }

            const history = stateManager.getStateHistory(componentId)
            expect(history.length).toBeLessThanOrEqual(100)
        })
    })

    describe("에러 복구", () => {
        test("ERROR 상태에서 복구가 가능해야 함", async () => {
            const componentId = "test-component"

            await stateManager.changeState(componentId, "STARTING")
            await stateManager.changeState(componentId, "ERROR")
            await stateManager.changeState(componentId, "STARTING")

            const state = stateManager.getState(componentId)
            expect(state?.state).toBe("STARTING")
        })

        test("ERROR 상태에서 잘못된 상태로의 전이를 방지해야 함", async () => {
            const componentId = "test-component"

            await stateManager.changeState(componentId, "STARTING")
            await stateManager.changeState(componentId, "ERROR")

            await expect(
                stateManager.changeState(componentId, "RUNNING")
            ).rejects.toThrow("Invalid state transition")
        })
    })
})
