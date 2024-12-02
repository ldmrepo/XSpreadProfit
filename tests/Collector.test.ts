import { jest } from "@jest/globals";
import EventManager from "../src/managers/EventManager";
import { Event, EventHandler } from "../src/types/events";
import { EventManagerConfig } from "../src/types/config";

describe("EventManager", () => {
    let eventManager: EventManager;

    beforeEach(async () => {
        eventManager = EventManager.getInstance();
        const config: EventManagerConfig = {
            retryPolicy: {
                maxRetries: 3,
                retryInterval: 100,
                backoffRate: 2,
            },
            eventTypes: ["MARKET_DATA.TRADE", "SYSTEM.STATUS"],
            subscriptionTimeout: 5000,
            maxSubscribersPerEvent: 10,
        };
        await eventManager.initialize(config);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("이벤트 발행/구독", () => {
        test("구독한 핸들러가 이벤트를 수신해야 함", async () => {
            const handler = jest.fn();
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", handler);
            await eventManager.publish(event);

            expect(handler).toHaveBeenCalledWith(event);
        });

        test("구독 취소 후에는 이벤트를 수신하지 않아야 함", async () => {
            const handler = jest.fn();
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", handler);
            eventManager.unsubscribe("MARKET_DATA.TRADE", handler);
            await eventManager.publish(event);

            expect(handler).not.toHaveBeenCalled();
        });

        test("여러 구독자가 같은 이벤트를 수신할 수 있어야 함", async () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", handler1);
            eventManager.subscribe("MARKET_DATA.TRADE", handler2);
            await eventManager.publish(event);

            expect(handler1).toHaveBeenCalledWith(event);
            expect(handler2).toHaveBeenCalledWith(event);
        });
    });

    describe("이벤트 유효성 검사", () => {
        test("유효하지 않은 이벤트 타입을 발행하면 에러가 발생해야 함", async () => {
            const event: Event = {
                type: "INVALID_TYPE",
                payload: {},
                timestamp: Date.now(),
                source: "test",
            };

            await expect(eventManager.publish(event)).rejects.toThrow(
                "Invalid event type"
            );
        });
    });

    describe("재시도 정책", () => {
        test("핸들러 실패 시 지정된 횟수만큼 재시도해야 함", async () => {
            const failingHandler = jest
                .fn()
                .mockRejectedValueOnce(new Error("First failure"))
                .mockRejectedValueOnce(new Error("Second failure"))
                .mockResolvedValueOnce(undefined);

            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", failingHandler);
            await eventManager.publish(event);

            expect(failingHandler).toHaveBeenCalledTimes(3);
        });

        test("최대 재시도 횟수 초과 시 에러가 발생해야 함", async () => {
            const failingHandler = jest
                .fn()
                .mockRejectedValue(new Error("Always fails"));
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", failingHandler);
            await expect(eventManager.publish(event)).rejects.toThrow();
            expect(failingHandler).toHaveBeenCalledTimes(4); // 초기 시도 + 3번의 재시도
        });
    });

    describe("메트릭", () => {
        test("이벤트 처리 성공 시 메트릭이 올바르게 업데이트되어야 함", async () => {
            const handler = jest.fn();
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", handler);
            await eventManager.publish(event);

            const metrics = eventManager.getMetrics();
            expect(metrics.eventsProcessed).toBe(1);
            expect(metrics.eventsFailed).toBe(0);
            expect(metrics.averageProcessingTime).toBeGreaterThan(0);
        });

        test("이벤트 처리 실패 시 메트릭이 올바르게 업데이트되어야 함", async () => {
            const failingHandler = jest
                .fn()
                .mockRejectedValue(new Error("Fail"));
            const event: Event = {
                type: "MARKET_DATA.TRADE",
                payload: { price: 100 },
                timestamp: Date.now(),
                source: "test",
            };

            eventManager.subscribe("MARKET_DATA.TRADE", failingHandler);
            try {
                await eventManager.publish(event);
            } catch (error) {
                // 에러는 예상된 것
            }

            const metrics = eventManager.getMetrics();
            expect(metrics.eventsProcessed).toBe(0);
            expect(metrics.eventsFailed).toBe(1);
        });
    });
});
