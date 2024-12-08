/**
 * Path: src/websocket/WebSocketClient.ts
 * WebSocket 클라이언트의 실제 구현
 * Node.js의 ws 라이브러리를 사용하여 WebSocket 연결 관리
 */

import WebSocket from "ws";
import { IWebSocketClient } from "./IWebSocketClient";

export class WebSocketClient implements IWebSocketClient {
    private ws: WebSocket | null = null;

    /**
     * WebSocket 연결을 설정합니다.
     * @param url WebSocket 서버 URL
     * @param options WebSocket 연결 옵션
     */
    connect(url: string, options?: WebSocket.ClientOptions): void {
        this.ws = new WebSocket(url, options);
    }

    /**
     * WebSocket 이벤트 핸들러를 설정합니다.
     * @param event 이벤트 이름 (open, message, close, error 등)
     * @param callback 이벤트 발생 시 호출될 콜백 함수
     */
    on(event: string, callback: (...args: any[]) => void): void {
        if (!this.ws) throw new Error("WebSocket is not connected");

        this.ws.on(event, callback);
    }

    /**
     * WebSocket을 통해 데이터를 전송합니다.
     * @param data 전송할 데이터
     */
    send(data: unknown): void {
        if (!this.ws) throw new Error("WebSocket is not connected");

        this.ws.send(JSON.stringify(data));
    }

    /**
     * WebSocket 연결을 닫습니다.
     */
    close(): void {
        if (!this.ws) throw new Error("WebSocket is not connected");

        this.ws.close();
    }
    removeListener(event: string, callback: (...args: any[]) => void): void {
        if (!this.ws) throw new Error("WebSocket is not connected");

        this.ws.removeListener(event, callback);
    }
}
