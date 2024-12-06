/**
 * Path: src/websocket/WebSocketManager.ts
 * WebSocket 연결 관리 및 메시지 송수신 담당
 */

import WebSocket from "ws"
import { EventEmitter } from "events"
import { WebSocketError, ErrorCode } from "../errors/types"
import { ConnectorState } from "../states/types"

interface WebSocketConfig {
    url: string
    options?: WebSocket.ClientOptions
    reconnectOptions?: {
        maxAttempts: number
        delay: number
    }
}

export class WebSocketManager extends EventEmitter {
    private ws: WebSocket | null = null
    private reconnectAttempts = 0
    private state: ConnectorState = ConnectorState.INITIAL

    constructor(private config: WebSocketConfig) {
        super()
    }

    async connect(): Promise<void> {
        if (this.state === ConnectorState.CONNECTED) {
            return
        }

        return new Promise((resolve, reject) => {
            try {
                this.state = ConnectorState.CONNECTING
                this.ws = new WebSocket(this.config.url, this.config.options)

                this.ws.on("open", () => {
                    this.state = ConnectorState.CONNECTED
                    this.reconnectAttempts = 0
                    this.emit("connected")
                    resolve()
                })

                this.ws.on("message", (data: WebSocket.Data) => {
                    this.handleMessage(data)
                })

                this.ws.on("close", () => {
                    this.handleClose()
                })

                this.ws.on("error", (error) => {
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
        if (this.state !== ConnectorState.CONNECTED || !this.ws) {
            return
        }

        return new Promise((resolve) => {
            this.ws!.close()
            this.state = ConnectorState.DISCONNECTED
            this.ws = null
            this.emit("disconnected")
            resolve()
        })
    }

    send(data: unknown): void {
        if (!this.ws || this.state !== ConnectorState.CONNECTED) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                "WebSocket is not connected"
            )
        }

        try {
            this.ws.send(JSON.stringify(data))
        } catch (error) {
            this.handleError(error)
            throw error
        }
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const parsed = JSON.parse(data.toString())
            this.emit("message", parsed)
        } catch (error) {
            this.handleError(
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
