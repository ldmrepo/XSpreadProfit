// Path: src/websocket/WebSocketManager.test.ts
import { WebSocketManager } from "../../src-dev/websocket/WebSocketManager"
import { MockWebSocketClient } from "./MockWebSocketClient"

test("WebSocketManager handles connection and disconnection", async () => {
    const mockClient = new MockWebSocketClient()
    const manager = new WebSocketManager(mockClient, {
        url: "ws://mock",
        reconnectOptions: { maxAttempts: 3, delay: 1000 },
    })

    let disconnected = false

    const onDisconnected = () => {
        disconnected = true
        console.log("Disconnected successfully")
    }

    manager.on("disconnected", onDisconnected)

    await manager.connect()
    expect(manager.getState()).toBe("CONNECTED")

    await manager.disconnect()
    expect(disconnected).toBe(true)
    expect(manager.getState()).toBe("DISCONNECTED")

    // 핸들러 정리
    manager.off("disconnected", onDisconnected)

    // MockWebSocketClient 정리
    mockClient.cleanup()
})
