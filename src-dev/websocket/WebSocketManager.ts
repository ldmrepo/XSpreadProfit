/**
 * Path: src/websocket/WebSocketManager.ts
 * WebSocket 연결 관리 및 메시지 송수신 담당
 */

import { IWebSocketClient } from "./IWebSocketClient" // 의존성 주입 인터페이스
import { EventEmitter } from "events"
import { WebSocketError, ErrorCode } from "../errors/types"
import { ConnectorState } from "../states/types"

interface WebSocketConfig {
    url: string
    options?: unknown
    reconnectOptions?: {
        maxAttempts: number
        delay: number
    }
}

export class WebSocketManager extends EventEmitter {
    private reconnectAttempts = 0
    private state: ConnectorState = ConnectorState.INITIAL

    constructor(
        private client: IWebSocketClient, // 의존성 주입된 WebSocket 클라이언트
        private config: WebSocketConfig
    ) {
        super()
    }

    async connect(): Promise<void> {
        if (this.state === ConnectorState.CONNECTED) {
            return
        }

        return new Promise((resolve, reject) => {
            try {
                this.state = ConnectorState.CONNECTING
                this.client.connect(this.config.url, this.config.options)

                this.client.on("open", () => {
                    this.state = ConnectorState.CONNECTED
                    this.reconnectAttempts = 0
                    this.emit("connected")
                    resolve()
                })

                this.client.on("message", (data) => {
                    this.handleMessage(data)
                })

                this.client.on("close", () => {
                    this.handleClose()
                })

                this.client.on("error", (error) => {
                    this.handleError(error)
                    reject(error)
                })
            } catch (error) {
                this.handleError(error)
                reject(error)
            }
        })
    }

    async disconnect(): Promise<void> {
        if (this.state !== ConnectorState.CONNECTED || !this.client) {
            return
        }

        return new Promise((resolve) => {
            this.client!.close()
            this.state = ConnectorState.DISCONNECTED
            this.emit("disconnected")
            resolve()
        })
    }

    send(data: unknown): void {
        if (!this.client || this.state !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "WebSocket is not connected"
            )
        }

        try {
            this.client.send(data)
            // this.client.send(JSON.stringify(data))
        } catch (error) {
            this.handleError(error)
            throw error
        }
    }

    private handleMessage(data: unknown): void {
        try {
            // 메시지 파싱 시도
            const parsed = typeof data === "string" ? JSON.parse(data) : data

            this.emit("message", parsed)
        } catch (error) {
            console.error("Message parsing error:", data, error) // 추가 로그
            // 에러를 throw하지 않고 emit만 함
            this.emit(
                "error",
                new WebSocketError(
                    ErrorCode.MESSAGE_PARSE_ERROR,
                    "Failed to parse message",
                    error as Error
                )
            )
        }
    }

    private handleClose(): void {
        this.state = ConnectorState.DISCONNECTED
        this.emit("disconnected")

        if (this.shouldReconnect()) {
            this.reconnect()
        }
    }

    private handleError(error: unknown): void {
        const wsError =
            error instanceof WebSocketError
                ? error
                : new WebSocketError(
                      ErrorCode.CONNECTION_FAILED,
                      error instanceof Error
                          ? error.message
                          : "WebSocket error occurred",
                      error instanceof Error ? error : undefined
                  )

        this.state = ConnectorState.ERROR
        this.emit("error", wsError)
    }

    private shouldReconnect(): boolean {
        return (
            this.config.reconnectOptions !== undefined &&
            this.reconnectAttempts < this.config.reconnectOptions.maxAttempts
        )
    }

    private async reconnect(): Promise<void> {
        this.reconnectAttempts++
        const delay = this.config.reconnectOptions?.delay ?? 1000

        await new Promise((resolve) => setTimeout(resolve, delay))

        try {
            await this.connect()
        } catch (error) {
            this.handleError(error)
        }
    }

    getState(): ConnectorState {
        return this.state
    }
}
