// Path: src/websocket/MockWebSocketClient.ts
import { IWebSocketClient } from "../../src-dev/websocket/IWebSocketClient"

export class MockWebSocketClient implements IWebSocketClient {
    private eventHandlers: { [key: string]: (...args: any[]) => void } = {}

    connect(url: string): void {
        console.log(`Mock WebSocket connected to ${url}`)
        if (this.eventHandlers["open"]) {
            this.eventHandlers["open"]()
        }
    }

    on(event: string, callback: (...args: any[]) => void): void {
        this.eventHandlers[event] = callback
    }

    send(data: unknown): void {
        console.log(`Mock WebSocket sent:`, data)
        if (this.eventHandlers["message"]) {
            this.eventHandlers["message"](data)
        }
    }

    close(): void {
        console.log("Mock WebSocket closed")
        if (this.eventHandlers["close"]) {
            this.eventHandlers["close"]()
        }
    }
}
