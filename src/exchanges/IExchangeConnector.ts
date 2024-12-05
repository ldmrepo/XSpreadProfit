import { ExchangeConnectorMetrics } from "../types/metrics"

// src/exchanges/IExchangeConnector.ts
export interface IExchangeConnector {
    start(): void
    stop(): void
    getMetrics(): ExchangeConnectorMetrics
}
