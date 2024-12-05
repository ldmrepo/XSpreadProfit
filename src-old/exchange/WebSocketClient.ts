import WebSocket from "ws"

/**
 * WebSocket 커넥터
 */
export class WebSocketClient {
    private ws: WebSocket | null = null
    private isConnected = false

    constructor(private readonly url: string) {}

    async connect(): Promise<void> {
        if (this.isConnected) return

        this.ws = new WebSocket(this.url)
        await this.waitForConnection()
        this.isConnected = true
    }

    async disconnect(): Promise<void> {
        if (!this.isConnected || !this.ws) return

        this.ws.close()
        this.ws = null
        this.isConnected = false
    }

    send(message: string): void {
        if (!this.isConnected || !this.ws) {
            throw new Error("Not connected")
        }
        this.ws.send(message)
    }

    onMessage(handler: (message: string) => void): void {
        if (!this.ws) return
        this.ws.onmessage = (event) => handler(event.data.toString())
    }

    onError(handler: (error: Error) => void): void {
        if (!this.ws) return
        this.ws.onerror = (event) => handler(event.error)
    }

    private waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error("No WebSocket instance"))
                return
            }

            this.ws.onopen = () => resolve()
            this.ws.onerror = (error) => reject(error)
        })
    }
}
