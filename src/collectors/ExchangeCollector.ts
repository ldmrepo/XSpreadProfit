import { ExchangeCoinRegistry } from "../models/ExchangeCoinRegistry"
import { buildCoinInfo } from "../models/CoinInfo"
import { IExchangeAdapter } from "../adapters/IExchangeAdapter"
import { CollectorMetrics } from "../types/metrics"
import { ExchangeConnector } from "./ExchangeConnector"
import { IExchangeConnector } from "../exchanges/IExchangeConnector"

export class ExchangeCollector {
    private exchangeCoinRegistry: ExchangeCoinRegistry
    private exchangeConnector: IExchangeConnector[] = []
    private groupedSymbols: string[][] = []
    private totalSymbols: number
    private currentState: "Ready" | "Running" | "Stopped" = "Ready" // 초기 상태

    constructor(
        private readonly exchange: IExchangeAdapter,
        private readonly symbols: string[]
    ) {
        this.exchangeCoinRegistry = new ExchangeCoinRegistry(
            exchange.getExchangeName()
        )
        this.totalSymbols = symbols.length
        this.initialize()
    }

    private initialize() {
        // 대상 정보를 레지스트리에 추가
        this.symbols.forEach((symbol) => {
            this.exchangeCoinRegistry.addCoin(buildCoinInfo(symbol))
        })
        const config = this.exchange.getWebSocketConfig()
        console.log(
            `[ExchangeCollector] ${this.exchange.getExchangeName()} WebSocket 설정:`,
            config
        )
        // 연결 제한에 따라 그룹화 [[], [], ...]
        this.groupedSymbols = this.symbols.reduce((acc, symbol, index) => {
            const groupIndex = Math.floor(
                index / config.streamLimitPerConnection
            )
            if (!acc[groupIndex]) {
                acc[groupIndex] = []
            }
            acc[groupIndex].push(symbol)
            return acc
        }, [] as string[][])

        this.groupedSymbols.forEach((symbols) => {
            this.exchangeConnector.push(
                new ExchangeConnector("1", symbols, this.exchange)
            )
        })
    }

    public start(): void {
        console.log("[ExchangeCollector] 수집 시작")
        this.currentState = "Running" // 상태 변경
        this.exchangeConnector.forEach((connector, index) => {
            try {
                connector.start()
                console.log(`[ExchangeCollector] Connector-${index} 시작`)
            } catch (error: any) {
                console.error(
                    `Connector-${index} 시작 중 오류 발생: ${error.message}`
                )
            }
        })
    }

    public stop(): void {
        console.log("[ExchangeCollector] 수집 중지")
        this.currentState = "Stopped" // 상태 변경
        this.exchangeConnector.forEach((connector, index) => {
            try {
                connector.stop()
                console.log(`[ExchangeCollector] Connector-${index} 중지`)
            } catch (error: any) {
                console.error(
                    `Connector-${index} 중지 중 오류 발생: ${error.message}`
                )
            }
        })
    }

    public getCurrentState(): string {
        return this.currentState
    }

    public getMetrics(): CollectorMetrics {
        const connectorMetrics = this.exchangeConnector.map((connector) =>
            connector.getMetrics()
        )

        const activeConnectors = connectorMetrics.filter(
            (metrics) => metrics.state === "Connected"
        ).length

        const totalMessagesReceived = connectorMetrics.reduce(
            (acc, metrics) => acc + (metrics.messagesReceived || 0),
            0
        )

        const totalErrors = connectorMetrics.reduce(
            (acc, metrics) => acc + (metrics.failedAttempts || 0),
            0
        )

        const averageLatency =
            connectorMetrics.length > 0
                ? connectorMetrics.reduce(
                      (acc, metrics) =>
                          acc + (metrics.averageMessageLatencyMs || 0),
                      0
                  ) / connectorMetrics.length
                : null

        const lastError =
            connectorMetrics
                .map((metrics) => metrics.lastError)
                .filter((error) => error !== undefined && error !== null)
                .pop() || undefined // null 대신 undefined 반환

        return {
            timestamp: Date.now(),
            totalSymbols: this.totalSymbols,
            connectorCount: this.exchangeConnector.length,
            groupedSymbolCount: this.groupedSymbols.length,
            currentState: this.getCurrentState(),
            activeConnectors,
            totalMessagesReceived,
            totalErrors,
            averageMessageLatencyMs: averageLatency,
            lastError, // undefined로 처리된 값 사용
        }
    }
}
