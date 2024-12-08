/**
 * Path: src/exchanges/binance/BinanceConnector.ts
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { WebSocketManager } from "../../websocket/WebSocketManagerState";
import { SymbolGroup } from "../../collectors/types";
import {
    BinanceBookTickerMessage,
    BinanceSubscription,
    BinanceBookTickerData,
} from "./types";
import { BinanceBookTickerConverter } from "./BinanceBookTickerConverter";
import { BookTickerData } from "../common/types";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";

export class BinanceConnector extends ExchangeConnector {
    private readonly RATE_LIMIT_PER_SECOND = 5;
    private lastRequestTime: number = 0;
    private requestCount: number = 0;

    constructor(
        id: string,
        symbols: SymbolGroup,
        wsManager: IWebSocketManager
    ) {
        super(id, symbols, wsManager);
    }

    private async checkRateLimit(): Promise<void> {
        const now = Date.now();
        const elapsedTime = now - this.lastRequestTime;

        if (elapsedTime < 1000) {
            this.requestCount++;
            if (this.requestCount >= this.RATE_LIMIT_PER_SECOND) {
                const waitTime = 1000 - elapsedTime;
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                this.requestCount = 0;
                this.lastRequestTime = Date.now();
            }
        } else {
            this.requestCount = 1;
            this.lastRequestTime = now;
        }
    }

    public formatSubscriptionRequest(symbols: string[]): BinanceSubscription {
        const params = symbols.flatMap((symbol) => [
            `${symbol.toLowerCase()}@bookTicker`,
            `${symbol.toLowerCase()}@depth20@100ms`, // 설정에 따라 depth level과 속도 조정 가능
        ]);

        return {
            method: "SUBSCRIBE",
            params,
            id: Date.now(),
        };
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): BinanceSubscription {
        const params = symbols.flatMap((symbol) => [
            `${symbol.toLowerCase()}@bookTicker`,
            `${symbol.toLowerCase()}@depth20@100ms`,
        ]);

        return {
            method: "UNSUBSCRIBE",
            params,
            id: Date.now(),
        };
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as BinanceBookTickerMessage;
            return (
                typeof msg === "object" &&
                msg !== null &&
                "u" in msg && // updateId
                "s" in msg && // symbol
                "b" in msg && // bid price
                "B" in msg && // bid qty
                "a" in msg && // ask price
                "A" in msg // ask qty
            );
        } catch {
            return false;
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        try {
            const msg = data as BinanceBookTickerMessage;
            // 바로 표준 형식으로 변환
            const standardizedData = BinanceBookTickerConverter.convert(msg);

            // 변환된 표준 데이터를 이벤트로 발생
            this.emit("bookTickerUpdate", standardizedData);

            return {
                type: "bookTicker",
                symbol: standardizedData.symbol,
                data: standardizedData,
            };
        } catch (error) {
            throw new WebSocketError(
                ErrorCode.MESSAGE_PARSE_ERROR,
                "Failed to parse Binance message",
                error as Error
            );
        }
    }

    // 추가: Book Ticker 데이터 변경 이벤트 리스너
    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }

    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Binance internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  );

        super.handleError(wsError);
    }
}
