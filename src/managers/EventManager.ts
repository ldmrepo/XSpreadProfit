// src/managers/EventManager.ts
/**
 * EventManager
 *
 * 시스템 전반의 이벤트 발행/구독을 관리하고 이벤트 라우팅을 처리하는 매니저
 * - 이벤트 발행/구독 관리
 * - 이벤트 라우팅 처리
 * - 이벤트 필터링
 * - 이벤트 로깅
 */

import { Logger } from "../utils/logger"
import { Metrics } from "../types/metrics"
import { Event, EventType, EventHandler, EventFilter } from "../types/events"
import { RetryPolicy, EventManagerConfig } from "../types/config"

class EventManager {
    private static instance: EventManager
    private subscribers: Map<string, Set<EventHandler>>
    private eventTypes: Map<string, EventType>
    private metrics: Metrics
    private logger: Logger
    private retryPolicy?: RetryPolicy

    private constructor() {
        this.subscribers = new Map()
        this.eventTypes = new Map()
        this.metrics = {
            eventsProcessed: 0,
            eventsFailed: 0,
            averageProcessingTime: 0,
        }
        this.logger = Logger.getInstance("EventManager")
    }

    static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager()
        }
        return EventManager.instance
    }

    async initialize(config: EventManagerConfig): Promise<void> {
        try {
            this.retryPolicy = config.retryPolicy
            await this.initializeEventTypes()
            this.logger.info("EventManager initialized successfully")
        } catch (error) {
            this.logger.error("Failed to initialize EventManager", error)
            throw error
        }
    }

    async publish(event: Event): Promise<void> {
        const startTime = Date.now()
        try {
            this.validateEvent(event)
            const handlers = this.getEventHandlers(event.type)

            await Promise.all(
                Array.from(handlers).map((handler) =>
                    this.executeHandler(handler, event)
                )
            )

            this.updateMetrics(startTime, true)
            this.logger.debug(`Event published successfully: ${event.type}`)
        } catch (error) {
            this.updateMetrics(startTime, false)
            this.logger.error(`Failed to publish event: ${event.type}`, error)
            throw error
        }
    }

    subscribe(type: string, handler: EventHandler, filter?: EventFilter): void {
        try {
            if (!this.subscribers.has(type)) {
                this.subscribers.set(type, new Set())
            }
            this.subscribers.get(type)!.add(handler)
            this.logger.debug(`Subscribed to event type: ${type}`)
        } catch (error) {
            this.logger.error(
                `Failed to subscribe to event type: ${type}`,
                error
            )
            throw error
        }
    }

    unsubscribe(type: string, handler: EventHandler): void {
        try {
            const handlers = this.subscribers.get(type)
            if (handlers) {
                handlers.delete(handler)
                this.logger.debug(`Unsubscribed from event type: ${type}`)
            }
        } catch (error) {
            this.logger.error(
                `Failed to unsubscribe from event type: ${type}`,
                error
            )
            throw error
        }
    }

    private async executeHandler(
        handler: EventHandler,
        event: Event
    ): Promise<void> {
        let retries = 0
        while (retries <= this.retryPolicy!.maxRetries) {
            try {
                await handler(event)
                return
            } catch (error) {
                retries++
                if (retries > this.retryPolicy!.maxRetries) {
                    throw error
                }
                await this.delay(this.retryPolicy!.retryInterval)
            }
        }
    }

    private validateEvent(event: Event): void {
        if (!this.eventTypes.has(event.type)) {
            throw new Error(`Invalid event type: ${event.type}`)
        }
        // Additional validation logic
    }

    private getEventHandlers(type: string): Set<EventHandler> {
        return this.subscribers.get(type) || new Set()
    }

    private updateMetrics(startTime: number, success: boolean): void {
        const processingTime = Date.now() - startTime
        this.metrics.eventsProcessed += success ? 1 : 0
        this.metrics.eventsFailed += success ? 0 : 1
        this.metrics.averageProcessingTime =
            (this.metrics.averageProcessingTime + processingTime) / 2
    }

    getMetrics(): Metrics {
        return { ...this.metrics }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    private async initializeEventTypes(): Promise<void> {
        // Initialize default event types
        const defaultTypes = [
            "MARKET_DATA.TRADE",
            "MARKET_DATA.ORDERBOOK",
            "SYSTEM.STATUS",
            "ERROR",
            "BUFFER.FLUSHED", // 추가
            "BUFFER.ERROR", // 추가
        ]

        defaultTypes.forEach((type) => {
            this.eventTypes.set(type, {
                name: type,
                priority: "NORMAL",
                retryable: true,
            })
        })
    }
}

export default EventManager
