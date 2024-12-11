/**
 * Path: src/exchanges/bithumb/BithumbConnector.ts
 */
import axios from "axios";
import { ExchangeConnector } from "../../collectors/ExchangeConnector";
import { WebSocketMessage } from "../../websocket/types";
import { WebSocketError, ErrorCode, ErrorSeverity } from "../../errors/types";
import { SymbolGroup } from "../../collectors/types";
import {
    BithumbOrderBookMessage,
    BithumbSubscription,
    convertBithumbSymbol,
} from "./types";
import { BookTickerData, ExchangeInfo } from "../common/types";
import { BithumbBookTickerConverter } from "./BithumbBookTickerConverter";
import { IWebSocketManager } from "../../websocket/IWebSocketManager";
import { ExchangeConfig } from "../../config/types";
import { splitIntoBatches } from "../../utils/common";

export class BithumbConnector extends ExchangeConnector {
    private readonly TICKET = `BITHUMB_${Date.now()}`;
    constructor(
        protected readonly id: string,
        protected readonly config: ExchangeConfig,
        protected readonly symbols: SymbolGroup,
        protected readonly wsManager: IWebSocketManager
    ) {
        super(id, config, symbols, wsManager);
    }
    protected pingMessage(): unknown {
        return "";
    }
    protected formatPingMessage(data?: unknown): unknown {
        return data;
    }
    public formatSubscriptionRequest(symbols: string[]): any {
        const topicBatches = splitIntoBatches(symbols, 10);
        return topicBatches.map((topicBatch: any, index: number) => {
            return [
                {
                    ticket: this.TICKET, // 클라이언트 요청 식별자
                },
                {
                    type: "orderbook", // 요청 타입
                    codes: topicBatch.map((symbol: string) =>
                        symbol.toUpperCase()
                    ), // 요청 마켓 코드 리스트 (대문자)
                    level: 1, // 호가 모아보기 단위 (기본값: 1)
                    isOnlySanpshot: false, // 스냅샷 데이터만 요청 여부
                    isOnlyRealtime: true, // 실시간 데이터만 요청 여부
                },
                {
                    format: "DEFAULT", // 데이터 포맷
                },
            ];
        });
    }

    protected formatUnsubscriptionRequest(
        symbols: string[]
    ): BithumbSubscription {
        return {
            type: "orderbook",
            symbols: symbols.map((symbol) => symbol),
            tickTypes: [],
        };
    }

    protected validateExchangeMessage(data: unknown): boolean {
        try {
            const msg = data as {
                type: string;
                code: string;
                total_ask_size: number;
                total_bid_size: number;
                orderbook_units: Array<{
                    ask_price: number;
                    bid_price: number;
                    ask_size: number;
                    bid_size: number;
                }>;
            };

            return (
                typeof msg === "object" &&
                msg !== null &&
                msg.type === "orderbook" &&
                typeof msg.code === "string" &&
                typeof msg.total_ask_size === "number" &&
                typeof msg.total_bid_size === "number" &&
                Array.isArray(msg.orderbook_units) &&
                msg.orderbook_units.every(
                    (unit) =>
                        typeof unit.ask_price === "number" &&
                        typeof unit.bid_price === "number" &&
                        typeof unit.ask_size === "number" &&
                        typeof unit.bid_size === "number"
                )
            );
        } catch (error) {
            console.error("validateExchangeMessage Error:", error);
            return false;
        }
    }

    protected normalizeExchangeMessage(
        data: unknown
    ): WebSocketMessage<BookTickerData> {
        const msg = data as BithumbOrderBookMessage;
        const bookTicker = BithumbBookTickerConverter.convert(
            this.config,
            data as any
        );

        return {
            type: "bookTicker",
            exchange: this.config.exchange,
            exchangeType: this.config.exchangeType,
            symbol: bookTicker.symbol,
            data: bookTicker,
        };
    }

    static async fetchSpotExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        try {
            const response = await axios.get<{
                data: {
                    market: string;
                    korean_name: string;
                    english_name: string;
                }[];
            }>(`${config.url}/v1/market/all`);

            // 응답 데이터 변환
            const data: any = response.data;

            return data
                .filter((item: any) => item.market.startsWith("KRW-")) // KRW 마켓만 필터링
                .map((item: any) => {
                    const [quoteSymbol, baseSymbol] = item.market.split("-");

                    return {
                        exchange: "bithumb",
                        exchangeType: config.exchangeType, // 빗썸은 현물 데이터로 가정
                        marketSymbol: item.market,
                        baseSymbol,
                        quoteSymbol,
                        status: "active", // 기본값 설정
                        isDepositEnabled: true, // 빗썸은 입출금 상태 정보를 제공하지 않으므로 기본값
                        isWithdrawalEnabled: true, // 입출금 기본값
                        minPrice: "0", // 빗썸은 가격 단위 정보를 제공하지 않으므로 기본값
                        maxPrice: "0", // 가격 단위 기본값
                        minOrderQty: "0", // 최소 주문량 기본값
                        maxOrderQty: "0", // 최대 주문량 기본값
                        additionalInfo: {
                            koreanName: item.korean_name,
                            englishName: item.english_name,
                            timestamp: Date.now(),
                        },
                    };
                });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    throw new WebSocketError(
                        ErrorCode.API_RATE_LIMIT,
                        "Bithumb API rate limit exceeded",
                        error,
                        ErrorSeverity.HIGH
                    );
                }
                throw new WebSocketError(
                    ErrorCode.API_REQUEST_FAILED,
                    `Bithumb API request failed: ${error.message}`,
                    error,
                    ErrorSeverity.HIGH
                );
            }
            throw new WebSocketError(
                ErrorCode.API_ERROR,
                "Unknown API error occurred",
                error as Error,
                ErrorSeverity.HIGH
            );
        }
    }
    static fetchFuturesExchangeInfo(
        config: ExchangeConfig
    ): Promise<ExchangeInfo[]> {
        throw new Error("Method not implemented.");
    }
    protected handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.INTERNAL_ERROR,
                      "Bithumb internal error",
                      error as Error,
                      ErrorSeverity.MEDIUM
                  );

        super.handleError(wsError);
    }

    onBookTickerUpdate(callback: (data: BookTickerData) => void): void {
        this.on("bookTickerUpdate", callback);
    }
}
