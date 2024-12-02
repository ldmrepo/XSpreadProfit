import { jest } from "@jest/globals";
import StateManager from "../src/managers/StateManager";
import EventManager from "../src/managers/EventManager";
import { State, ComponentState } from "../src/types/state";
import { StateManagerConfig, EventManagerConfig } from "../src/types/config";
import { Event, EventHandler, EventFilter } from "../src/types/events";
import { Metrics } from "../src/types/metrics";
import { Logger } from "../src/utils/logger";

describe("StateManager", () => {
    let stateManager: StateManager;
    let mockEventManager: EventManager;

    beforeEach(async () => {
        // EventManager의 전체 구현을 mock으로 생성
        const eventManagerImpl = {
            // 공개 메서드
            initialize: jest.fn().mockReturnValue(Promise.resolve()),
            publish: jest.fn().mockReturnValue(Promise.resolve()),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({
                eventsProcessed: 0,
                eventsFailed: 0,
                averageProcessingTime: 0,
            }),

            // 내부 속성
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
        };

        mockEventManager = eventManagerImpl as unknown as EventManager;

        jest.spyOn(EventManager, "getInstance").mockImplementation(
            () => mockEventManager
        );

        stateManager = StateManager.getInstance();
        const config: StateManagerConfig = {
            stateHistoryLimit: 100,
            validationEnabled: true,
            stateChangeTimeout: 5000,
        };

        await stateManager.initialize(config);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });
    describe("상태 변경", () => {
        test("유효한 상태 전이를 허용해야 함", async () => {
            const componentId = "test-component";

            await stateManager.changeState(componentId, "STARTING");
            let state = stateManager.getState(componentId);
            expect(state?.state).toBe("STARTING");

            await stateManager.changeState(componentId, "RUNNING");
            state = stateManager.getState(componentId);
            expect(state?.state).toBe("RUNNING");

            expect(mockEventManager.publish).toHaveBeenCalledTimes(2);
        });

        test("잘못된 상태 전이를 거부해야 함", async () => {
            const componentId = "test-component";

            await stateManager.changeState(componentId, "STARTING");

            await expect(
                stateManager.changeState(componentId, "STOPPED")
            ).rejects.toThrow("Invalid state transition");
        });

        test("상태 변경 시 이벤트를 발행해야 함", async () => {
            const componentId = "test-component";
            await stateManager.changeState(componentId, "STARTING");

            expect(mockEventManager.publish).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "SYSTEM.STATE_CHANGE",
                    payload: expect.objectContaining({
                        componentId,
                        state: "STARTING",
                    }),
                })
            );
        });
    });

    describe("상태 이력", () => {
        test("상태 변경 이력을 기록해야 함", async () => {
            const componentId = "test-component";

            await stateManager.changeState(componentId, "STARTING");
            await stateManager.changeState(componentId, "RUNNING");
            await stateManager.changeState(componentId, "PAUSED");

            const history = stateManager.getStateHistory(componentId);
            expect(history).toHaveLength(3);
            expect(history[0].state).toBe("STARTING");
            expect(history[1].state).toBe("RUNNING");
            expect(history[2].state).toBe("PAUSED");
        });

        test("이력이 제한 크기를 초과하지 않아야 함", async () => {
            const componentId = "test-component";

            // 101개의 상태 변경 생성
            for (let i = 0; i < 101; i++) {
                await stateManager.changeState(componentId, "STARTING");
                await stateManager.changeState(componentId, "RUNNING");
            }

            const history = stateManager.getStateHistory(componentId);
            expect(history.length).toBeLessThanOrEqual(100);
        });
    });

    describe("상태 전이 규칙", () => {
        test("유효한 다음 상태 목록을 반환해야 함", () => {
            const validTransitions =
                stateManager.getValidTransitions("RUNNING");
            expect(validTransitions).toContain("PAUSED");
            expect(validTransitions).toContain("STOPPING");
            expect(validTransitions).toContain("ERROR");
        });

        test("상태 전이 검증이 올바르게 동작해야 함", () => {
            expect(() => {
                stateManager.validateStateTransition("RUNNING", "PAUSED");
            }).not.toThrow();

            expect(() => {
                stateManager.validateStateTransition("RUNNING", "STARTING");
            }).toThrow("Invalid state transition");
        });
    });

    describe("시스템 상태 조회", () => {
        test("모든 컴포넌트의 현재 상태를 반환해야 함", async () => {
            await stateManager.changeState("component1", "RUNNING");
            await stateManager.changeState("component2", "PAUSED");

            const allStates = stateManager.getAllComponentStates();
            expect(allStates.get("component1")?.state).toBe("RUNNING");
            expect(allStates.get("component2")?.state).toBe("PAUSED");
        });

        test("존재하지 않는 컴포넌트의 상태는 undefined를 반환해야 함", () => {
            const state = stateManager.getState("non-existent");
            expect(state).toBeUndefined();
        });
    });

    describe("에러 복구", () => {
        test("ERROR 상태에서 복구가 가능해야 함", async () => {
            const componentId = "test-component";

            await stateManager.changeState(componentId, "STARTING");
            await stateManager.changeState(componentId, "ERROR");
            await stateManager.changeState(componentId, "STARTING");

            const state = stateManager.getState(componentId);
            expect(state?.state).toBe("STARTING");
        });

        test("ERROR 상태에서 잘못된 상태로의 전이를 방지해야 함", async () => {
            const componentId = "test-component";

            await stateManager.changeState(componentId, "ERROR");

            await expect(
                stateManager.changeState(componentId, "RUNNING")
            ).rejects.toThrow("Invalid state transition");
        });
    });

    describe("초기화", () => {
        test("초기화 후 기본 전이 규칙이 설정되어야 함", () => {
            const transitions = stateManager.getValidTransitions("INIT");
            expect(transitions).toBeDefined();
            expect(transitions.has("STARTING")).toBe(true);
        });
    });
});
