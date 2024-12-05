/**
 * src/Collector.ts
 *
 * Collector (수집기)
 * - WebSocket 및 REST API를 통한 시장 데이터 수집 및 상태 관리
 * - 코인 구독 상태 관리
 * - 이벤트 발행 및 상태 보고
 */

import WebSocket from "ws"
import { Logger } from "../utils/logger"
import {
    ExchangeInfo,
    ExchangeInterface,
    ExchangeSymbolInfo,
    ParsedSocketMessage,
    StandardizedResponse,
} from "../interfaces/ExchangeInterface"
import { EventManagerInterface } from "../interfaces/EventManagerInterface"
import { StateManagerInterface } from "../interfaces/StateManagerInterface"
import { MetricManagerInterface } from "../interfaces/MetricManagerInterface"
import { ErrorManagerInterface } from "../interfaces/ErrorManagerInterface"
import { CollectorConfig } from "../types/config"
import axios from "axios"
import { json } from "stream/consumers"

export enum CollectorState {
    INITIAL = "INITIAL",
    PREPARING = "PREPARING",
    READY = "READY",
    RUNNING = "RUNNING",
    STOPPED = "STOPPED",
    ERROR = "ERROR",
}

enum SubscriptionState {
    PENDING = "PENDING",
    SUBSCRIBED = "SUBSCRIBED",
    UNSUBSCRIBED = "UNSUBSCRIBED",
    FAILED = "FAILED",
}

interface CoinSubscription {
    symbol: string
    state: SubscriptionState
    lastUpdated: number
    attempts: number
}

class Collector {
    private id: string
    private adapter: ExchangeInterface
    private eventManager: EventManagerInterface
    private stateManager: StateManagerInterface
    private metricManager: MetricManagerInterface
    private errorManager: ErrorManagerInterface
    private logger: Logger

    private ws: WebSocket | null
    private currentState: CollectorState = CollectorState.STOPPED
    private subscriptions: Map<string, CoinSubscription> = new Map()

    private reconnectAttempts: number
    private restFallbackActive: boolean

    private targetSymbols: ExchangeSymbolInfo[] = [] // 구독 대상 심볼 리스트

    constructor(
        adapter: ExchangeInterface,
        targetSymbols: ExchangeSymbolInfo[],
        config: CollectorConfig,
        managers: {
            eventManager: EventManagerInterface
            stateManager: StateManagerInterface
            metricManager: MetricManagerInterface
            errorManager: ErrorManagerInterface
        }
    ) {
        this.id = config.id
        this.targetSymbols = targetSymbols
        this.adapter = adapter
        this.eventManager = managers.eventManager
        this.stateManager = managers.stateManager
        this.metricManager = managers.metricManager
        this.errorManager = managers.errorManager

        this.logger = Logger.getInstance(`Collector:${this.id}`)
        this.ws = null
        this.reconnectAttempts = 0
        this.restFallbackActive = false

        // 초기화
        this.subscriptions = targetSymbols.reduce((acc, symbol) => {
            acc.set(symbol.symbol, {
                symbol: symbol.symbol,
                state: SubscriptionState.PENDING,
                lastUpdated: Date.now(),
                attempts: 0,
            })
            return acc
        }, new Map())
    }

    private async changeState(
        newState: CollectorState,
        reason?: string
    ): Promise<void> {
        if (this.currentState === newState) {
            this.logger.warn(`Collector is already in state: ${newState}`)
            return
        }

        const previousState = this.currentState
        this.currentState = newState

        this.logger.info(
            `Collector state changed from ${previousState} to ${newState}. Reason: ${
                reason || "No reason provided"
            }`
        )

        await this.eventManager.publish({
            type: "COLLECTOR_STATE_CHANGE",
            payload: {
                id: this.id,
                previousState,
                newState,
                reason,
                timestamp: Date.now(),
            },
        })
    }

    private assertState(requiredState: CollectorState): void {
        if (this.currentState !== requiredState) {
            throw new Error(
                `Invalid state: Expected ${requiredState}, but current state is ${this.currentState}`
            )
        }
    }

    async start(): Promise<void> {
        try {
            this.logger.info(
                `Starting Collector..: ${this.targetSymbols.length} symbols`
            )

            // 상태 전환: READY
            await this.changeState(
                CollectorState.READY,
                "Subscription targets determined."
            )

            // WebSocket 연결 시작
            const wsConfig = this.adapter.getWebSocketConfig()
            this.connect(wsConfig.spot_ws_url)

            // 상태 전환: RUNNING
            await this.changeState(
                CollectorState.RUNNING,
                "Collector started successfully."
            )
        } catch (error: any) {
            await this.changeState(
                CollectorState.ERROR,
                "Startup error occurred."
            )
            this.logger.error("Error starting Collector.", error)
            throw error
        }
    }

    async stop(): Promise<void> {
        try {
            await this.changeState(
                CollectorState.STOPPED,
                "Stopping collector."
            )
            this.disconnect()
            await this.changeState(
                CollectorState.STOPPED,
                "Collector stopped successfully."
            )
        } catch (error: any) {
            await this.changeState(
                CollectorState.ERROR,
                "Error occurred during stop."
            )
            this.logger.error("Error stopping Collector.", error)
            throw error
        }
    }

    async subscribe(symbols: string[]): Promise<void> {
        this.assertState(CollectorState.RUNNING)
        symbols.forEach((symbol) => {
            this.subscriptions.set(symbol, {
                symbol,
                state: SubscriptionState.PENDING,
                lastUpdated: Date.now(),
                attempts: 0,
            })
        })

        const message = this.adapter.requestSpotSubscribeStream(
            symbols,
            500 // 요청 아이디
        )
        // this.logger.info(
        //     `Subscription request sent for: ${JSON.stringify(message)}`
        // )
        await this.sendMessage(message)
    }

    async unsubscribe(symbols: string[]): Promise<void> {
        this.assertState(CollectorState.RUNNING)

        const message = this.adapter.requestSpotUnsubscribeStream(
            symbols,
            Date.now()
        )
        await this.sendMessage(message)

        symbols.forEach((symbol) => {
            const subscription = this.subscriptions.get(symbol)
            if (subscription) {
                subscription.state = SubscriptionState.UNSUBSCRIBED
                subscription.lastUpdated = Date.now()
            }
        })

        // this.logger.info(`Unsubscribed from symbols: ${symbols.join(", ")}`)
    }

    private connect(url: string): void {
        this.logger.info(`🚀 ~ Collector ~ connect ~ url: ${url}`)
        this.ws = new WebSocket(url)

        this.ws.on("open", () => {
            this.logger.info("WebSocket connection established.")
            this.resubscribe()
        })

        this.ws.on("message", async (data) => {
            try {
                this.logger.info(`🚀 ~ Collector ~ this.ws.on ~ data: ${data}`)
                const parsedMessage: ParsedSocketMessage =
                    this.adapter.parseSocketMessage(JSON.parse(data.toString()))
                this.handleSocketMessage(parsedMessage)
            } catch (error) {
                this.logger.error("Error parsing WebSocket message.", error)
            }
        })

        this.ws.on("close", () => {
            this.logger.warn("WebSocket connection closed.")
            this.handleConnectionClose()
        })

        this.ws.on("error", (error) => {
            this.logger.error("WebSocket error occurred.", error)
        })
    }

    private disconnect(): void {
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }

    private async handleSocketMessage(
        message: ParsedSocketMessage
    ): Promise<void> {
        this.logger.info(`🚀 ~ Collector ~ message: ${JSON.stringify(message)}`)
        switch (message.type) {
            case "SUBSCRIPTION":
                this.updateSubscriptionStates(message.data)
                break
            case "ORDER_BOOK":
                this.logger.info(
                    `🚀 ~ Collector ~ message: ${JSON.stringify(message)}`
                )
                break
            default:
                this.logger.warn("Unhandled WebSocket message type.", message)
        }
    }

    private updateSubscriptionStates(data: any): void {
        const activeSymbols = data.subscriptions || []
        this.subscriptions.forEach((subscription, symbol) => {
            if (activeSymbols.includes(symbol)) {
                subscription.state = SubscriptionState.SUBSCRIBED
            } else if (subscription.state === SubscriptionState.SUBSCRIBED) {
                subscription.state = SubscriptionState.UNSUBSCRIBED
            }
            subscription.lastUpdated = Date.now()
        })
    }

    private async resubscribe(): Promise<void> {
        const pendingSubscriptions = Array.from(this.subscriptions.values())
            .filter((sub) => sub.state === SubscriptionState.PENDING)
            .map((sub) => sub.symbol)

        if (pendingSubscriptions.length > 0) {
            await this.subscribe(pendingSubscriptions)
        }
    }

    private async sendMessage(data: any): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected.")
        }

        this.logger.info(
            `🚀 ~ Collector ~ resubscribe ~ pendingSubscriptions:${
                JSON.stringify(data).length
            }`
        )

        this.ws.send(JSON.stringify(data))
    }

    private async handleConnectionClose(): Promise<void> {
        if (this.reconnectAttempts >= 5) {
            await this.changeState(
                CollectorState.ERROR,
                "Max reconnect attempts reached."
            )
        } else {
            this.reconnectAttempts++
            this.logger.warn(
                `Reconnecting... Attempt ${this.reconnectAttempts}`
            )
            const wsConfig = this.adapter.getWebSocketConfig()
            setTimeout(() => this.connect(wsConfig.spot_ws_url), 5000)
        }
    }
    getSubscriptions(): string[] {
        this.logger.info("Getting subscriptions...")
        return Array.from(this.subscriptions.keys())
    }
}

export default Collector
