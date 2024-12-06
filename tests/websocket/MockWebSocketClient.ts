// Path: src/websocket/MockWebSocketClient.ts
import { IWebSocketClient } from "../../src-dev/websocket/IWebSocketClient"

export class MockWebSocketClient implements IWebSocketClient {
    private eventHandlers: { [key: string]: (...args: any[]) => void } = {}
    private closeTimeout: NodeJS.Timeout | null = null

    connect(url: string): void {
        console.log(`Mock WebSocket connected to ${url}`)
        setTimeout(() => {
            if (this.eventHandlers["open"]) this.eventHandlers["open"]()
        }, 10) // 10ms 딜레이로 open 이벤트 호출
    }

    on(event: string, callback: (...args: any[]) => void): void {
        this.eventHandlers[event] = callback
    }

    send(data: unknown): void {
        console.log(`Mock WebSocket sent:`, data)
        if (this.eventHandlers["message"]) {
            setTimeout(() => this.eventHandlers["message"](data), 10) // 10ms 딜레이로 message 호출
        }
    }

    close(): void {
        console.log("Mock WebSocket closed")
        this.closeTimeout = setTimeout(() => {
            if (this.eventHandlers["close"]) this.eventHandlers["close"]()
        }, 10) // 10ms 딜레이로 close 이벤트 호출
    }

    emit(event: string, ...args: any[]): void {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event](...args)
        } else {
            console.warn(`No handler registered for event: ${event}`)
        }
    }

    cleanup(): void {
        if (this.closeTimeout) {
            clearTimeout(this.closeTimeout)
        }
    }
}
