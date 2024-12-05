import { ExchangeCoinRegistry } from "../models/ExchangeCoinRegistry"
import { IExchangeAdapter } from "../adapters/IExchangeAdapter"
import { IExchangeConnector } from "../exchanges/IExchangeConnector"
import { buildCoinInfo } from "../models/CoinInfo"
import { ExchangeConnectorMetrics } from "metrics"
import WebSocket from "ws"

type ConnectorState =
    | "Ready"
    | "Connecting"
    | "Connected"
    | "Subscription Requesting"
    | "Failed"
    | "Stopped"

export class ExchangeConnector implements IExchangeConnector {
    private exchangeCoinRegistry: ExchangeCoinRegistry
    protected ws: WebSocket | null = null
    protected connected: boolean = false

    private activeSubscriptions: number = 0
    private failedAttempts: number = 0
    private messagesReceived: number = 0
    private messagesProcessed: number = 0
    private reconnectAttempts: number = 0
    private averageLatencySum: number = 0
    private latencyCount: number = 0
    private lastError: string | null = null
    private state: ConnectorState = "Ready" // 초기 상태를 "Ready"로 설정

    constructor(
        private readonly id: string,
        private readonly symbols: string[],
        private readonly exchange: IExchangeAdapter
    ) {
        console.log(
            `[ExchangeConnector] ${id} ${this.exchange.getExchangeName()} 생성`
        )
        this.exchangeCoinRegistry = new ExchangeCoinRegistry(
            exchange.getExchangeName()
        )
        this.initialize()
    }

    private initialize() {
        this.symbols.forEach((symbol) => {
            this.exchangeCoinRegistry.addCoin(buildCoinInfo(symbol))
        })
        const config = this.exchange.getWebSocketConfig()
        console.log(
            `[ExchangeConnector] ${this.exchange.getExchangeName()} WebSocket 설정:`,
            config
        )
    }

    public getState(): ConnectorState {
        return this.state
    }

    private setState(newState: ConnectorState): void {
        console.log(
            `[ExchangeConnector] 상태 변경: ${this.state} → ${newState}`
        )
        this.state = newState
    }

    public start(): void {
        console.log("🚀 ~ ExchangeConnector ~ start ~ 시작")
        this.state = "Connecting"
        this.connect()
    }

    public stop(): void {
        console.log("[ExchangeConnector] 중지")
        this.state = "Stopped"
        this.disconnect()
    }

    public async connect(): Promise<void> {
        if (this.connected || this.ws !== null) return
        try {
            console.log(
                "🚀 ~ 연결 시도:",
                this.exchange.getWebSocketConfig().wsUrl
            )
            this.state = "Connecting"
            this.ws = new WebSocket(this.exchange.getWebSocketConfig().wsUrl)
            await this.setupWebSocketHandlers()
        } catch (error) {
            this.failedAttempts++
            this.lastError =
                error instanceof Error ? error.message : String(error)
            console.error("WebSocket 연결 중 오류 발생", error)
        }
    }

    public async disconnect(): Promise<void> {
        if (!this.ws) return
        console.log("[ExchangeConnector] 연결 종료")
        return new Promise((resolve) => {
            this.ws?.close()
            this.ws = null
            this.connected = false
            resolve()
        })
    }

    private async setupWebSocketHandlers(): Promise<void> {
        if (!this.ws) return

        return new Promise((resolve, reject) => {
            if (!this.ws) return reject(new Error("WebSocket is null"))

            this.ws.on("open", () => {
                console.log("[ExchangeConnector] 연결 성공")
                this.connected = true
                this.setState("Connected") // 연결 성공 상태로 전환
                try {
                    this.subscribe() // 연결 후 구독 요청
                } catch (error) {
                    console.error(
                        "[ExchangeConnector] 구독 요청 중 오류 발생",
                        error
                    )
                    this.setState("Failed")
                }
                resolve()
            })

            this.ws.on("message", (data: WebSocket.Data) => {
                console.log("[ExchangeConnector] 수신 데이터:", data)
                try {
                    this.exchange.parsingSocketMessage(data)
                } catch (error) {
                    console.error("WebSocket 데이터 파싱 중 오류 발생", error)
                }
            })

            this.ws.on("close", () => {
                console.log("[ExchangeConnector] 연결 종료")
                this.connected = false
                if (this.state !== "Stopped") {
                    this.setState("Failed") // 연결 종료 시 복구 또는 실패 상태로 전환
                    this.handleReconnect()
                }
            })

            this.ws.on("error", (error: Error) => {
                console.error("WebSocket 에러 발생", error)
                this.setState("Failed")
            })
        })
    }

    private subscribe(): void {
        console.log("[ExchangeConnector] 구독 요청 시작")
        this.setState("Subscription Requesting") // 구독 상태로 전환
        const params = this.exchange.subscribe(
            this.exchangeCoinRegistry.getCoins()
        )
        this.ws?.send(JSON.stringify(params))
        console.log("[ExchangeConnector] 구독 요청 완료")
    }

    protected async handleReconnect(): Promise<void> {
        if (this.reconnectAttempts >= 9999) {
            console.error("재연결 시도 횟수 초과")
            this.state = "Failed"
            return
        }
        this.reconnectAttempts++
        console.log(
            `[ExchangeConnector] 재연결 시도 중 (${this.reconnectAttempts})`
        )
        setTimeout(async () => {
            try {
                await this.connect()
            } catch (error) {
                console.error("재연결 중 오류 발생", error)
            }
        }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000))
    }

    public getMetrics(): ExchangeConnectorMetrics {
        const averageMessageLatencyMs =
            this.latencyCount > 0
                ? this.averageLatencySum / this.latencyCount
                : undefined

        return {
            timestamp: Date.now(),
            totalSymbols: this.symbols.length,
            state: this.state,
            activeSubscriptions: this.activeSubscriptions,
            failedAttempts: this.failedAttempts,
            messagesReceived: this.messagesReceived,
            messagesProcessed: this.messagesProcessed,
            reconnectAttempts: this.reconnectAttempts,
            averageMessageLatencyMs,
            lastError: this.lastError ?? undefined, // null을 undefined로 변환
        }
    }
}
