/**
 * src/factories/ExchangeAdapterFactory.ts
 *
 * Exchange Adapter Factory
 * - 거래소별 어댑터 인스턴스 생성 및 관리
 * - 싱글톤 패턴으로 구현하여 어댑터 재사용
 * - 지원되지 않는 거래소에 대한 예외 처리
 */

import { ExchangeAdapterInterface } from "../interfaces/ExchangeAdapterInterface";
import { BinanceAdapter } from "../adapters/binance/BinanceAdapter";
// import { UpbitAdapter } from "../adapters/upbit/UpbitAdapter";
// import { BitfinexAdapter } from "../adapters/bitfinex/BitfinexAdapter";
import { Logger } from "../utils/logger";
import { UnsupportedExchangeError } from "../types/errors";

class ExchangeAdapterFactory {
    private static instance: ExchangeAdapterFactory;
    private adapters: Map<string, ExchangeAdapterInterface>;
    private logger: Logger;

    private constructor() {
        this.adapters = new Map();
        this.logger = Logger.getInstance("ExchangeAdapterFactory");
    }

    static getInstance(): ExchangeAdapterFactory {
        if (!ExchangeAdapterFactory.instance) {
            ExchangeAdapterFactory.instance = new ExchangeAdapterFactory();
        }
        return ExchangeAdapterFactory.instance;
    }

    createAdapter(exchange: string): ExchangeAdapterInterface {
        const exchangeId = exchange.toUpperCase();

        // 기존 어댑터가 있으면 재사용
        if (this.adapters.has(exchangeId)) {
            return this.adapters.get(exchangeId)!;
        }

        // 새 어댑터 생성
        let adapter: ExchangeAdapterInterface;

        try {
            switch (exchangeId) {
                case "BINANCE":
                    adapter = new BinanceAdapter();
                    break;
                // case "UPBIT":
                //     adapter = new UpbitAdapter();
                //     break;
                // case "BITFINEX":
                //     adapter = new BitfinexAdapter();
                //     break;
                default:
                    throw new UnsupportedExchangeError(exchangeId);
            }

            this.adapters.set(exchangeId, adapter);
            this.logger.info(`Created adapter for exchange: ${exchangeId}`);
            return adapter;
        } catch (error) {
            this.logger.error(
                `Failed to create adapter for ${exchangeId}:`,
                error
            );
            throw error;
        }
    }

    hasAdapter(exchange: string): boolean {
        return this.adapters.has(exchange.toUpperCase());
    }

    clearAdapter(exchange: string): void {
        this.adapters.delete(exchange.toUpperCase());
    }
}

export default ExchangeAdapterFactory;
