/**
 * Path: src/upbit/marketSubscription.ts
 * 기능 요약:
 * - 업비트 REST API로 마켓 정보 조회
 * - WebSocket을 통해 실시간 거래 데이터 구독
 * - Ping/Pong을 통해 연결 상태 유지
 * - 배치 처리로 구독/구독 취소 관리
 */

import axios from "axios"
import WebSocket from "ws"

// 업비트 REST API 응답 데이터 타입 정의
interface MarketInfo {
    market: string
    korean_name: string
    english_name: string
}

// WebSocket 관리 클래스
class UpbitWebSocketManager {
    private ws!: WebSocket
    private readonly MAX_BATCH_SIZE = 100 // 한 번에 처리할 구독/구독 취소 심볼 수
    private baseUrl = "wss://api.upbit.com/websocket/v1"

    // WebSocket 연결 설정
    private connect(): void {
        this.ws = new WebSocket(this.baseUrl)

        this.ws.on("open", () => {
            console.log("WebSocket 연결 성공")
        })

        this.ws.on("message", (data) => {
            console.log("실시간 데이터 수신:", data.toString())
        })

        this.ws.on("ping", () => {
            console.log("Ping 수신 - Pong 전송")
            this.ws.pong() // Ping에 대한 응답
        })

        this.ws.on("error", (error) => {
            console.error("WebSocket 에러:", error)
        })

        this.ws.on("close", () => {
            console.log("WebSocket 연결 종료")
        })
    }

    // 구독 요청
    public async subscribe(marketSymbols: string[]): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connect()
            await new Promise((resolve) => setTimeout(resolve, 1000)) // 연결 대기
        }

        // 배치 처리
        for (let i = 0; i < marketSymbols.length; i += this.MAX_BATCH_SIZE) {
            const batch = marketSymbols.slice(i, i + this.MAX_BATCH_SIZE)
            const request = [
                { ticket: "unique-ticket" },
                { type: "ticker", codes: batch },
            ]
            this.ws.send(JSON.stringify(request))
            console.log("구독 요청 전송:", request)
        }
    }

    // 구독 취소 요청
    public async unsubscribe(marketSymbols: string[]): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("WebSocket이 열려 있지 않습니다.")
            return
        }

        // 배치 처리
        for (let i = 0; i < marketSymbols.length; i += this.MAX_BATCH_SIZE) {
            const batch = marketSymbols.slice(i, i + this.MAX_BATCH_SIZE)
            const request = [
                { ticket: "unique-ticket" },
                { type: "ticker", codes: batch, isUnsubscribe: true },
            ]
            this.ws.send(JSON.stringify(request))
            console.log("구독 취소 요청 전송:", batch)
        }
    }
}

// 업비트 REST API로 마켓 정보 조회
const getMarketInfo = async (): Promise<string[]> => {
    const url = "https://api.upbit.com/v1/market/all"

    try {
        const response = await axios.get(url, {
            headers: { Accept: "application/json" },
        })

        const markets = response.data as MarketInfo[]
        // KRW 마켓 필터링
        return markets
            .filter((market) => market.market.startsWith("KRW-"))
            .map((market) => market.market)
    } catch (error) {
        console.error("Failed to fetch market info:", error)
        throw error
    }
}

// 메인 실행 로직
const main = async () => {
    try {
        const manager = new UpbitWebSocketManager()

        // 1. 업비트 마켓 정보 조회
        const marketSymbols = await getMarketInfo()
        console.log("KRW 마켓 심볼 목록:", marketSymbols.slice(0, 10))

        // 2. WebSocket을 통해 실시간 데이터 구독
        await manager.subscribe(marketSymbols.slice(0, 100)) // 최대 100개 구독

        // 3. 테스트: 구독 취소
        setTimeout(async () => {
            await manager.unsubscribe(marketSymbols.slice(0, 100))
        }, 5000) // 5초 후 구독 취소
    } catch (error) {
        console.error("메인 로직 실행 중 오류 발생:", error)
    }
}

main()
