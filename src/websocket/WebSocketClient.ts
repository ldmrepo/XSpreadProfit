/**
 * Path: src/websocket/WebSocketClient.ts
 * WebSocket 클라이언트의 실제 구현
 * Node.js의 ws 라이브러리를 사용하여 WebSocket 연결 관리
 */

import WebSocket from "ws";
import { IWebSocketClient } from "./IWebSocketClient";
import { EventEmitter } from "events";

export class WebSocketClient extends EventEmitter implements IWebSocketClient {
    private ws: WebSocket | null = null;
    private pendingHandlers: {
        event: string;
        callback: (...args: any[]) => void;
    }[] = [];

    constructor() {
        super(); // EventEmitter 생성자 호출
    }

    connect(url: string, options?: WebSocket.ClientOptions): Promise<void> {
        console.log("[WebSocketClient] Attempting to connect:", url);
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url, options);

            this.ws.on("open", () => {
                console.log("[WebSocketClient] 'open' event fired");
                // 대기중인 핸들러들 등록
                for (const { event, callback } of this.pendingHandlers) {
                    console.log(
                        `[WebSocketClient] Registering pending handler for event: ${event}`
                    );
                    this.ws?.on(event, callback);
                }
                this.pendingHandlers = [];

                console.log(
                    "[WebSocketClient] Connected and handlers registered"
                );

                // 여기서 'open' 이벤트를 상위로 emit
                this.emit("open");

                resolve();
            });

            this.ws.on("message", (data: any) => {
                // console.log("[WebSocketClient] 'message' event fired:", data);
                this.emit("message", data);
            });

            this.ws.on("close", () => {
                console.log("[WebSocketClient] 'close' event fired");
                this.emit("close");
            });

            this.ws.on("error", (error) => {
                console.error("[WebSocketClient] onerror event fired:", error);
                reject(error);
            });
        });
    }

    on(event: string, callback: (...args: any[]) => void): this {
        // EventEmitter의 on() 메서드를 호출 (super.on())
        super.on(event, callback);
        return this;
    }

    send(data: unknown): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected or not ready");
        }
        console.log("[WebSocketClient] Sending data:", data);
        this.ws.send(JSON.stringify(data));
    }

    close(): void {
        if (!this.ws) throw new Error("WebSocket is not connected");
        console.log("[WebSocketClient] Closing websocket");
        this.ws.close();
    }
    onWsEvent(event: string, callback: (...args: any[]) => void): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.pendingHandlers.push({ event, callback });
        } else {
            this.ws.on(event, callback);
        }
    }

    removeListener(event: string, callback: (...args: any[]) => void): this {
        super.removeListener(event, callback);
        return this;
    }

    getReadyState(): number {
        const state = this.ws?.readyState ?? WebSocket.CLOSED;
        console.log("[WebSocketClient] getReadyState:", state);
        return state;
    }
}
