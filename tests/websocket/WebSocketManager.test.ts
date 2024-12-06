// Path: src/websocket/WebSocketManager.test.ts
import { WebSocketManager } from "../../src-dev/websocket/WebSocketManager"
import { MockWebSocketClient } from "./MockWebSocketClient"

test("WebSocketManager handles connection and disconnection", async () => {
    const mockClient = new MockWebSocketClient()
    const manager = new WebSocketManager(mockClient, {
        url: "ws://mock",
        reconnectOptions: { maxAttempts: 3, delay: 1000 },
    })

    await manager.connect()
    expect(manager.getState()).toBe("CONNECTED")

    manager.on("disconnected", () => {
        console.log("Disconnected successfully")
    })

    await manager.disconnect()
    expect(manager.getState()).toBe("DISCONNECTED")
})
