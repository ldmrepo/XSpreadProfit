/**
 * Path: src/websocket/WebSocketClient.ts
 * WebSocket 클라이언트의 실제 구현
 * Node.js의 ws 라이브러리를 사용하여 WebSocket 연결 관리
 */

import WebSocket from "ws";
import { IWebSocketClient } from "./IWebSocketClient";

export class WebSocketClient implements IWebSocketClient {
    private ws: WebSocket | null = null;

    connect(url: string, options?: WebSocket.ClientOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url, options);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (error) => reject(error);
        });
    }

    on(event: string, callback: (...args: any[]) => void): void {
        if (!this.ws) throw new Error("WebSocket is not connected");
        this.ws.on(event, callback);
    }

    send(data: unknown): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected or not ready");
        }
        this.ws.send(JSON.stringify(data));
    }

    close(): void {
        if (!this.ws) throw new Error("WebSocket is not connected");
        this.ws.close();
    }

    removeListener(event: string, callback: (...args: any[]) => void): void {
        if (!this.ws) throw new Error("WebSocket is not connected");
        this.ws.removeListener(event, callback);
    }

    getReadyState(): number {
        return this.ws?.readyState ?? WebSocket.CLOSED;
    }
}
