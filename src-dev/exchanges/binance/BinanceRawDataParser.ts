/**
 * Path: src/exchanges/binance/BinanceUnifiedParser.ts
 * 바이낸스 WebSocket 데이터 통합 파서
 */

// 이벤트 타입 정의 (Enum)
export enum BinanceEventType {
    LIST_SUBSCRIPTIONS = "listSubscriptions",
    DEPTH_UPDATE = "depthUpdate",
    BOOK_TICKER = "bookTicker",
    UNKNOWN = "unknown",
    ERROR = "error",
}

// 표준화된 반환 타입
export interface ParsedMessage<T = any> {
    type: BinanceEventType // 이벤트 타입 (Enum)
    data: T // 파싱된 데이터
}

// LIST_SUBSCRIPTIONS 응답 타입
export interface ParsedListSubscriptions {
    subscriptions: string[] // 활성 구독 목록
}

// Individual Symbol Book Ticker Streams 타입
export interface ParsedBookTicker {
    s: string
    b: [number, number] // [ price: number; quantity: number ]
    a: [number, number] // [ price: number; quantity: number ]
}

// Diff. Depth Stream 타입
export interface ParsedDepthUpdate {
    e: number
    s: string
    U: number
    u: number
    b: [] // [ price: number; quantity: number ][]
    a: [] // [ price: number; quantity: number ][]
}

export class BinanceRawDataParser {
    /**
     * Binance WebSocket 메시지를 파싱하고 표준화된 구조로 반환
     * @param rawData - WebSocket에서 수신한 Raw 데이터
     * @returns ParsedMessage - 표준화된 반환 타입
     */
    static parse(parsed: any): ParsedMessage {
        console.log("🚀 ~ BinanceRawDataParser ~ parse ~ parsed:", parsed)
        try {
            // JSON 파싱
            //   typeof rawData === "string" ? JSON.parse(rawData) : rawData
            // LIST_SUBSCRIPTIONS 응답 처리
            if ("result" in parsed && Array.isArray(parsed.result)) {
                return {
                    type: BinanceEventType.LIST_SUBSCRIPTIONS,
                    data: this.parseListSubscriptions(parsed),
                }
            }

            // Diff. Depth Stream 처리
            if ("e" in parsed && parsed.e === "depthUpdate") {
                return {
                    type: BinanceEventType.DEPTH_UPDATE,
                    data: this.parseDepthUpdate(parsed),
                }
            }

            // Individual Symbol Book Ticker Streams 처리
            if ("b" in parsed && "a" in parsed && "s" in parsed) {
                return {
                    type: BinanceEventType.BOOK_TICKER,
                    data: this.parseBookTicker(parsed),
                }
            }

            // 알 수 없는 데이터 형식
            return {
                type: BinanceEventType.UNKNOWN,
                data: parsed,
            }
        } catch (error) {
            console.error("Failed to parse Binance WebSocket data:", error)
            return {
                type: BinanceEventType.ERROR,
                data: { error: "Failed to parse raw data", details: error },
            }
        }
    }

    /**
     * LIST_SUBSCRIPTIONS 데이터 파싱
     */
    private static parseListSubscriptions(data: any): ParsedListSubscriptions {
        return {
            subscriptions: data.result,
        }
    }

    /**
     * Diff. Depth Stream 데이터 파싱
     */
    private static parseDepthUpdate(data: any): ParsedDepthUpdate {
        return {
            e: data.E,
            s: data.s,
            U: data.U,
            u: data.u,
            b: data.b.map(([price, quantity]: [string, string]) => [
                parseFloat(price),
                parseFloat(quantity),
            ]),
            a: data.a.map(([price, quantity]: [string, string]) => [
                parseFloat(price),
                parseFloat(quantity),
            ]),
        }
    }

    /**
     * Individual Symbol Book Ticker Streams 데이터 파싱
     */
    private static parseBookTicker(data: any): ParsedBookTicker {
        return {
            s: data.s,
            b: [parseFloat(data.b), parseFloat(data.B)],
            a: [parseFloat(data.a), parseFloat(data.A)],
        }
    }
}
