/**
 * Path: src/binance/spotFuturesSubscription.ts
 * 기능 요약:
 * - Binance REST API를 통해 현물 및 선물 거래 정보를 조회
 * - 조회된 심볼로 WebSocket을 통해 실시간 데이터를 구독
 * - Ping/Pong을 통해 연결 상태 유지
 * - Binance의 IP당 연결 제한(300) 및 연결당 최대 스트림 제한(1024)을 고려
 */

import axios from "axios"
import WebSocket from "ws"

// REST API 응답 데이터 타입 정의
interface SymbolInfo {
    symbol: string
    status: string
    quoteAsset: string
}

// WebSocket 관리 클래스
class BinanceWebSocketManager {
    private connections: WebSocket[] = []
    private readonly MAX_CONNECTIONS = 300 // IP당 최대 연결 수
    private readonly MAX_STREAMS_PER_CONNECTION = 1024 // 연결당 최대 스트림 수

    // WebSocket 생성 및 Ping 처리
    private createWebSocket(url: string): WebSocket {
        const ws = new WebSocket(url)

        ws.on("open", () => {
            console.log("WebSocket 연결 성공:", url)
        })

        ws.on("message", (data) => {
            // console.log("실시간 데이터 수신:", data.toString())
        })

        ws.on("ping", (data) => {
            console.log("Ping 수신 - Pong 전송")
            ws.pong(data) // Ping에 응답
        })

        ws.on("error", (error) => {
            console.error("WebSocket 에러:", error)
        })

        ws.on("close", () => {
            console.log("WebSocket 연결 종료:", url)
        })

        return ws
    }

    // WebSocket에 심볼 구독 요청
    private subscribe(ws: WebSocket, symbols: string[]): void {
        const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@trade`)
        const request = {
            method: "SUBSCRIBE",
            params: streams,
            id: Date.now(),
        }
        ws.send(JSON.stringify(request))
        console.log("구독 요청 전송:", streams)
    }

    // WebSocket을 통해 심볼 구독 관리
    public subscribeToSymbols(symbols: string[], baseUrl: string): void {
        if (symbols.length === 0) {
            console.log("구독할 심볼이 없습니다.")
            return
        }

        for (
            let i = 0;
            i < symbols.length;
            i += this.MAX_STREAMS_PER_CONNECTION
        ) {
            const batch = symbols.slice(i, i + this.MAX_STREAMS_PER_CONNECTION)

            if (this.connections.length >= this.MAX_CONNECTIONS) {
                console.error("최대 연결 제한에 도달했습니다.")
                break
            }

            const wsUrl = `${baseUrl}?streams=${batch
                .map((s) => `${s.toLowerCase()}@bookTicker`)
                .join("/")}`
            const ws = this.createWebSocket(wsUrl)
            this.connections.push(ws)
        }

        console.log(
            "모든 심볼 구독 요청 완료",
            this.connections.length,
            symbols.length
        )
    }
}

// REST API 호출 함수
const getExchangeInfo = async (url: string): Promise<string[]> => {
    try {
        const response = await axios.get(url)
        const symbols = response.data.symbols as SymbolInfo[]

        // 거래 가능한 USDT 페어 심볼 필터링
        return symbols
            .filter(
                (symbol) =>
                    symbol.status === "TRADING" && symbol.quoteAsset === "USDT"
            )
            .map((symbol) => symbol.symbol)
    } catch (error) {
        console.error(`Failed to fetch exchange info from ${url}:`, error)
        throw error
    }
}

// 메인 실행 로직
const main = async () => {
    try {
        const manager = new BinanceWebSocketManager()

        // 현물 및 선물 거래소 정보 조회
        const spotSymbols = await getExchangeInfo(
            "https://api.binance.com/api/v3/exchangeInfo"
        )
        const futuresSymbols = await getExchangeInfo(
            "https://fapi.binance.com/fapi/v1/exchangeInfo"
        )

        console.log("현물 심볼 목록:", spotSymbols.slice(0, 10))
        console.log("선물 심볼 목록:", futuresSymbols.slice(0, 10))

        // WebSocket을 통해 실시간 데이터 구독
        manager.subscribeToSymbols(
            spotSymbols.slice(0, 1024),
            "wss://stream.binance.com:9443/stream"
        ) // 현물
        manager.subscribeToSymbols(
            futuresSymbols.slice(0, 1024),
            "wss://fstream.binance.com/stream"
        ) // 선물
    } catch (error) {
        console.error("메인 로직 실행 중 오류 발생:", error)
    }
}

main()
