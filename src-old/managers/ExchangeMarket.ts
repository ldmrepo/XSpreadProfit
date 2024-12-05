/**
 * src/ExchangeMarket.ts
 *
 * Market 클래스
 * - 단일 Collector 클래스를 사용하여 Spot 및 Futures 데이터 관리
 * - Collector 초기화 및 구독 대상 관리
 */

import Collector from "../components/Collector"
import { Logger } from "../utils/logger"
import { EventManagerInterface } from "../interfaces/EventManagerInterface"
import { StateManagerInterface } from "../interfaces/StateManagerInterface"
import {
    ExchangeInfo,
    ExchangeInterface,
    ExchangeSymbolInfo,
    StandardizedResponse,
} from "../interfaces/ExchangeInterface"
import { BinanceAdapter } from "../adapters/binance/BinanceAdapter"
import { MetricManagerInterface } from "../interfaces/MetricManagerInterface"
import { ErrorManagerInterface } from "../interfaces/ErrorManagerInterface"
import axios from "axios"

export enum MarketState {
    INITIAL = "INITIAL", // 초기 상태
    READY = "READY", // 준비 완료
    RUNNING = "RUNNING", // 실행 중
    STOPPED = "STOPPED", // 중지됨
    ERROR = "ERROR", // 오류 상태
}

export class ExchangeMarket {
    private state: MarketState = MarketState.INITIAL
    private logger: Logger
    private spotCollector: Collector | null = null
    private futuresCollector: Collector | null = null
    private spotExchangeInfo!: StandardizedResponse<ExchangeInfo>
    private exchangeSpotInterface!: ExchangeInterface
    private exchangeFutureInterface!: ExchangeInterface
    private futuresExchangeInfo!: StandardizedResponse<ExchangeInfo>

    private targetSymbols: ExchangeSymbolInfo[] = [] // 구독 대상 심볼 리스트
    private config: any
    constructor(
        private id: string,
        private binanceSpotAdapter: ExchangeInterface,
        private binanceFutureAdapter: ExchangeInterface,
        private eventManager: EventManagerInterface,
        private stateManager: StateManagerInterface,
        private metricManager: MetricManagerInterface,
        private errorManager: ErrorManagerInterface
    ) {
        this.logger = Logger.getInstance(`Market:${this.id}`)
        this.exchangeSpotInterface = binanceSpotAdapter
        this.exchangeFutureInterface = binanceFutureAdapter
    }

    /**
     * Market 초기화
     */
    async initialize(): Promise<void> {
        try {
            this.logger.info("Initializing Market...")
            this.state = MarketState.READY

            // 구독 대상 심볼 결정
            this.targetSymbols = await this.determineTargetSymbols()
            this.logger.info(`구독 대상: ${this.targetSymbols.length}`)

            // Collector 초기화 (현물)
            this.spotCollector = new Collector(
                this.binanceSpotAdapter,
                this.targetSymbols || [],
                {
                    id: `${this.id}-spot`,
                    exchangeId: "1",
                    retryPolicy: {
                        maxRetries: 3,
                        retryInterval: 1000,
                        backoffRate: 1,
                    },
                    websocketUrl: "",
                },
                {
                    eventManager: this.eventManager,
                    stateManager: this.stateManager,
                    metricManager: this.metricManager,
                    errorManager: this.errorManager,
                }
            )

            // Collector 초기화 (선물)
            // this.futuresCollector = new Collector(
            //     this.binanceFutureAdapter,
            //     this.targetSymbols || [],
            //     {
            //         id: `${this.id}-futures`,
            //         exchangeId: "1",
            //         retryPolicy: {
            //             maxRetries: 3,
            //             retryInterval: 1000,
            //             backoffRate: 1,
            //         },
            //         websocketUrl: "wss://fstream.binance.com/ws",
            //     },
            //     {
            //         eventManager: this.eventManager,
            //         stateManager: this.stateManager,
            //         metricManager: this.metricManager,
            //         errorManager: this.errorManager,
            //     }
            // )

            this.logger.info("Market initialized successfully.")
        } catch (error) {
            this.state = MarketState.ERROR
            this.logger.error("Error initializing Market.", error)
            throw error
        }
    }
    private async determineTargetSymbols(): Promise<ExchangeSymbolInfo[]> {
        try {
            this.logger.info("Determining subscription targets...")

            // REST API 호출 및 표준화 처리
            this.spotExchangeInfo = await this.fetchAndStandardizeExchangeInfo(
                this.binanceSpotAdapter.requestSpotExchangeInfoApi(),
                this.binanceSpotAdapter.responseSpotExchangeInfoApi
            )

            this.futuresExchangeInfo =
                await this.fetchAndStandardizeExchangeInfo(
                    this.binanceFutureAdapter.requestFuturesExchangeInfoApi(),
                    this.binanceFutureAdapter.responseFuturesExchangeInfoApi
                )
            // 대상 심볼 결정 로직
            const targetSymbols =
                this.futuresExchangeInfo?.standard.symbols.length > 0
                    ? this.futuresExchangeInfo.standard.symbols
                    : this.spotExchangeInfo.standard.symbols
            return targetSymbols
        } catch (error) {
            this.logger.error("Error determining subscription targets.", error)
            throw error
        }
    }

    private async fetchAndStandardizeExchangeInfo(
        apiRequest: any,
        standardizeResponse: (data: any) => StandardizedResponse<ExchangeInfo>
    ): Promise<StandardizedResponse<ExchangeInfo>> {
        try {
            const response = await axios.get(apiRequest.url)
            return standardizeResponse(response.data)
        } catch (error) {
            this.logger.error(
                "Error fetching and standardizing exchange info.",
                error
            )
            throw error
        }
    }
    /**
     * Market 시작
     */
    async start(): Promise<void> {
        if (this.state !== MarketState.READY) {
            this.logger.error("Market must be in READY state to start.")
            throw new Error("Market not ready to start.")
        }

        try {
            this.logger.info("Starting Market...")
            this.state = MarketState.RUNNING

            // 각 Collector 시작
            await Promise.all([
                this.spotCollector?.start(),
                this.futuresCollector?.start(),
            ])

            this.logger.info("Market started successfully.")
        } catch (error) {
            this.state = MarketState.ERROR
            this.logger.error("Error starting Market.", error)
            throw error
        }
    }

    /**
     * Market 중지
     */
    async stop(): Promise<void> {
        try {
            this.logger.info("Stopping Market...")
            this.state = MarketState.STOPPED

            // 각 Collector 중지
            await Promise.all([
                this.spotCollector?.stop(),
                this.futuresCollector?.stop(),
            ])

            this.logger.info("Market stopped successfully.")
        } catch (error) {
            this.state = MarketState.ERROR
            this.logger.error("Error stopping Market.", error)
            throw error
        }
    }

    /**
     * Market 상태 확인
     */
    getState(): MarketState {
        return this.state
    }

    /**
     * 구독 대상 심볼 확인
     */
    getSubscriptionTargets(): string[] {
        return this.targetSymbols.map((symbol) => symbol.symbol)
    }
}
