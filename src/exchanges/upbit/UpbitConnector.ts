/**
 * Path: src/exchanges/upbit/UpbitConnector.ts
 */
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { SymbolGroup } from "../../collectors/types";
import {
    UpbitOrderBookMessage,
    UpbitSubscription,
    convertUpbitMarketCode,
} from "./types";
import { BookTickerData } from "../common/types";
import { UpbitBookTickerConverter } from "./UpbitBookTickerConverter";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";

export class UpbitConnector extends ExchangeConnector {
    private readonly TICKET = `UPBIT_${Date.now()}`;
    private readonly converter: UpbitBookTickerConverter;

    constructor(
        id: string,
        symbols: SymbolGroup,
        wsManager: IWebSocketManager
    ) {
        super(id, symbols, wsManager);
        this.converter = new UpbitBookTickerConverter();
    }

    public formatSubscriptionRequest(symbols: string[]): UpbitSubscription {
        return {
            ticket: this.TICKET,
            type: "orderbook",
            codes: symbols.map((symbol) =>
                convertUpbitMarketCode.toMarketCode(symbol)
            ),
            format: "SIMPLE",
        };
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): UpbitSubscription {
        return {
            ticket: this.TICKET,
            type: "orderbook",
            codes: symbols.map((symbol) =>
                convertUpbitMarketCode.toMarketCode(symbol)
            ),
        };
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as UpbitOrderBookMessage;
            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbook" &&
                "code" in msg &&
                "timestamp" in msg &&
                "orderbook_units" in msg &&
                Array.isArray(msg.orderbook_units) &&
                msg.orderbook_units.length > 0
            );
        } catch {
            return false;
        }
    }

    // UpbitConnector에서
    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as UpbitOrderBookMessage;
        const bookTicker = UpbitBookTickerConverter.convert(msg);

        this.emit("bookTickerUpdate", bookTicker);

        return {
            type: "bookTicker",
            symbol: bookTicker.symbol,
            data: bookTicker,
        };
    }

    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Upbit internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  );

        super.handleError(wsError);
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }
}
