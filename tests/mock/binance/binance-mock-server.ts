/**
 * src/server/binance-mock-server.ts
 *
 * 통합 서버
 * - Binance Spot 및 Futures API (REST 및 WebSocket 지원)
 * - 초기화 시 Binance API를 사용해 현물 및 선물 거래소 정보를 가져옴
 * - REST API: /api/v3/exchangeInfo (Spot), /fapi/v1/exchangeInfo (Futures)
 * - WebSocket API: <symbol>@bookTicker, <symbol>@depth<levels>
 */

import express from "express"
import axios from "axios"
import { Server } from "http"
import WebSocket, { WebSocketServer } from "ws"
import fs from "fs"

interface SymbolInfo {
    symbol: string
    status: string
    baseAsset: string
    quoteAsset: string
    orderTypes: string[]
    filters: any[]
    isSpotTradingAllowed?: boolean
    isMarginTradingAllowed?: boolean
}

interface ExchangeInfo {
    symbols: SymbolInfo[]
}

interface Subscription {
    client: WebSocket
    symbol: string
    marketType: "spot" | "futures"
    stream: string // 스트림 유형 (bookTicker, depth 등)
}

export class BinanceMockServer {
    private app: express.Application
    private httpServer: Server | null = null
    private wsServer: WebSocketServer
    private spotExchangeInfo: ExchangeInfo | null = null
    private futuresExchangeInfo: ExchangeInfo | null = null
    private subscriptions: Set<Subscription>

    constructor(private port: number, private wsPort: number) {
        this.app = express()
        this.wsServer = new WebSocketServer({ port: wsPort })
        this.subscriptions = new Set()
        this.setupRestEndpoints()
        this.setupWebSocketServer()
    }

    public async initialize(): Promise<void> {
        console.log("Initializing server with Binance exchange data...")

        try {
            // Spot 정보 가져오기
            const spotResponse = await axios.get(
                "https://api.binance.com/api/v3/exchangeInfo"
            )
            this.spotExchangeInfo = { symbols: spotResponse.data.symbols }
            this.spotExchangeInfo.symbols =
                this.spotExchangeInfo.symbols.filter(
                    (item) =>
                        item.isSpotTradingAllowed &&
                        item.status === "TRADING" &&
                        item.quoteAsset === "USDT"
                )
            fs.writeFileSync(
                "spotResponse.json",
                JSON.stringify(this.spotExchangeInfo, null, 2)
            )

            // Futures 정보 가져오기
            const futuresResponse = await axios.get(
                "https://fapi.binance.com/fapi/v1/exchangeInfo"
            )
            this.futuresExchangeInfo = { symbols: futuresResponse.data.symbols }
            this.futuresExchangeInfo.symbols =
                this.futuresExchangeInfo.symbols.filter(
                    (item) =>
                        item.status === "TRADING" && item.quoteAsset === "USDT"
                )
            fs.writeFileSync(
                "futuresResponse.json",
                JSON.stringify(this.futuresExchangeInfo, null, 2)
            )
        } catch (error: any) {
            console.error("Initialization failed:", error.message)
        }

        console.log("Initialization completed.")
    }

    private setupRestEndpoints(): void {
        this.app.get("/api/v3/exchangeInfo", (req: any, res: any) => {
            if (!this.spotExchangeInfo) {
                return res
                    .status(500)
                    .json({ code: -1, msg: "Spot exchange info not available" })
            }
            res.json(this.spotExchangeInfo)
        })

        this.app.get("/fapi/v1/exchangeInfo", (req: any, res: any) => {
            if (!this.futuresExchangeInfo) {
                return res.status(500).json({
                    code: -1,
                    msg: "Futures exchange info not available",
                })
            }
            res.json(this.futuresExchangeInfo)
        })
    }

    private setupWebSocketServer(): void {
        this.wsServer.on("connection", (ws) => {
            console.log("WebSocket client connected")

            ws.on("message", (message) => {
                try {
                    const data = JSON.parse(message.toString())
                    console.log("🚀 ~ BinanceMockServer ~ ws.on ~ data:", data)
                    if (data.method === "SUBSCRIBE") {
                        this.handleSubscribe(ws, data.params)
                    } else if (data.method === "UNSUBSCRIBE") {
                        this.handleUnsubscribe(ws, data.params)
                    }
                } catch (error) {
                    console.log(
                        "🚀 ~ BinanceMockServer ~ ws.on ~ error:",
                        error
                    )
                    ws.send(
                        JSON.stringify({
                            error: { code: -1, msg: "Invalid message format" },
                        })
                    )
                }
            })

            ws.on("close", () => {
                this.subscriptions.forEach((sub) => {
                    if (sub.client === ws) this.subscriptions.delete(sub)
                })
                console.log("WebSocket client disconnected")
            })
        })
    }

    private handleSubscribe(ws: WebSocket, params: string[]): void {
        console.log(
            "🚀 ~ BinanceMockServer ~ handleSubscribe ~ params:",
            params
        )
        params.forEach((param) => {
            const [symbol, stream] = param.split("@")
            const marketType = stream.includes("futures") ? "futures" : "spot"

            const subscription: Subscription = {
                client: ws,
                symbol,
                marketType,
                stream,
            }
            this.subscriptions.add(subscription)

            console.log(`Subscribed to ${symbol}@${stream}`)
        })
    }

    private handleUnsubscribe(ws: WebSocket, params: string[]): void {
        console.log(
            "🚀 ~ BinanceMockServer ~ handleUnsubscribe ~ params:",
            params
        )
        params.forEach((param) => {
            const [symbol, stream] = param.split("@")

            this.subscriptions.forEach((sub) => {
                if (
                    sub.client === ws &&
                    sub.symbol === symbol &&
                    sub.stream === stream
                ) {
                    this.subscriptions.delete(sub)
                    console.log(`Unsubscribed from ${symbol}@${stream}`)
                }
            })
        })
    }

    private broadcastUpdates(): void {
        setInterval(() => {
            this.subscriptions.forEach((sub) => {
                if (sub.stream === "bookTicker") {
                    this.sendBookTickerUpdate(sub)
                } else if (sub.stream.startsWith("depth")) {
                    const levels = parseInt(sub.stream.replace("depth", ""))
                    this.sendDepthUpdate(sub, levels)
                }
            })
        }, 1000) // 1초 간격으로 업데이트
    }

    private sendBookTickerUpdate(sub: Subscription): void {
        const bestBidPrice = (Math.random() * 1000 + 1000).toFixed(2)
        const bestBidQty = (Math.random() * 10).toFixed(2)
        const bestAskPrice = (parseFloat(bestBidPrice) + 0.1).toFixed(2)
        const bestAskQty = (Math.random() * 10).toFixed(2)

        const update = {
            u: Date.now(), // Order book update ID
            s: sub.symbol, // Symbol
            b: bestBidPrice, // Best bid price
            B: bestBidQty, // Best bid quantity
            a: bestAskPrice, // Best ask quantity
            A: bestAskQty, // Best ask price
        }
        console.log(
            "🚀 ~ BinanceMockServer ~ sendBookTickerUpdate ~ update:",
            update
        )

        sub.client.send(JSON.stringify(update))
    }

    private sendDepthUpdate(sub: Subscription, levels: number): void {
        const basePrice = Math.random() * 1000 + 1000
        const bids = Array.from({ length: levels }, (_, i) => [
            (basePrice - i * 0.1).toFixed(2),
            (Math.random() * 10).toFixed(2),
        ])
        const asks = Array.from({ length: levels }, (_, i) => [
            (basePrice + i * 0.1).toFixed(2),
            (Math.random() * 10).toFixed(2),
        ])

        const update = {
            lastUpdateId: Date.now(),
            bids,
            asks,
        }
        console.log(
            "🚀 ~ BinanceMockServer ~ sendDepthUpdate ~ update:",
            update
        )

        sub.client.send(JSON.stringify(update))
    }

    public start(): void {
        this.httpServer = this.app.listen(this.port, () =>
            console.log(`REST server running on port ${this.port}`)
        )
        this.broadcastUpdates()
    }

    public stop(): void {
        if (this.httpServer) {
            this.httpServer.close()
            console.log("HTTP server stopped.")
        }
        this.wsServer.close()
        console.log("WebSocket server stopped.")
    }
}

// Example usage:
;(async () => {
    const mockServer = new BinanceMockServer(8080, 8081)
    await mockServer.initialize()
    mockServer.start()
})()
