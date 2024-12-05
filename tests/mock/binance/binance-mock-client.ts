import axios from "axios"
import WebSocket from "ws"

class BinanceMockClient {
    private baseUrl: string
    private wsUrl: string
    private ws: WebSocket | null = null

    constructor(baseUrl: string, wsUrl: string) {
        this.baseUrl = baseUrl
        this.wsUrl = wsUrl
    }

    // Spot Exchange Info 테스트
    public async testSpotExchangeInfo(): Promise<void> {
        try {
            console.log("Fetching Spot exchange info...")
            const response = await axios.get(
                `${this.baseUrl}/api/v3/exchangeInfo`
            )
            console.log("Spot exchange info fetched successfully:")
            console.log(JSON.stringify(response.data, null, 2))
        } catch (error: any) {
            console.error("Error fetching Spot exchange info:", error.message)
        }
    }

    // Futures Exchange Info 테스트
    public async testFuturesExchangeInfo(): Promise<void> {
        try {
            console.log("Fetching Futures exchange info...")
            const response = await axios.get(
                `${this.baseUrl}/fapi/v1/exchangeInfo`
            )
            console.log("Futures exchange info fetched successfully:")
            console.log(JSON.stringify(response.data, null, 2))
        } catch (error: any) {
            console.error(
                "Error fetching Futures exchange info:",
                error.message
            )
        }
    }

    // WebSocket 연결 테스트
    public async testWebSocket(symbols: string[] = ["BTCUSDT"]): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log("Testing WebSocket connection...")

            this.ws = new WebSocket(this.wsUrl)

            this.ws.on("open", () => {
                console.log("WebSocket connected successfully")

                // 구독 메시지 전송
                const subscribeMsg = {
                    method: "SUBSCRIBE",
                    params: symbols.map((symbol) => `${symbol}@depth`),
                }
                this.ws.send(JSON.stringify(subscribeMsg))
                console.log(`Subscribed to symbols: ${symbols.join(", ")}`)

                // 10초 동안 데이터 수신 후 연결 종료
                setTimeout(() => {
                    if (this.ws) {
                        this.ws.close()
                        resolve()
                    }
                }, 10000)
            })

            this.ws.on("message", (data) => {
                const message = JSON.parse(data.toString())
                console.log("Received market data:", message)
            })

            this.ws.on("close", () => {
                console.log("WebSocket connection closed")
            })

            this.ws.on("error", (error) => {
                console.error("WebSocket error:", error)
                reject(error)
            })
        })
    }

    // 모든 테스트 실행
    public async runTests(): Promise<void> {
        await this.testSpotExchangeInfo()
        await this.testFuturesExchangeInfo()
        await this.testWebSocket()
    }

    // 리소스 정리
    public cleanup(): void {
        if (this.ws) {
            this.ws.close()
        }
    }
}

// 실행 스크립트
;(async () => {
    const mockClient = new BinanceMockClient(
        "http://localhost:8080",
        "ws://localhost:8081"
    )

    console.log("Starting tests...")
    try {
        await mockClient.runTests()
        console.log("All tests completed.")
    } catch (error) {
        console.error("Tests failed:", error)
    } finally {
        mockClient.cleanup()
    }
})()
