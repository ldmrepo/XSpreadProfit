/**
 * Path: src/websocket/IWebSocketClient.ts
 * WebSocket 클라이언트 인터페이스 정의
 * 다양한 WebSocket 구현체를 지원하기 위한 인터페이스
 */

export interface IWebSocketClient {
    /**
     * WebSocket 서버에 연결합니다.
     * @param url WebSocket 서버 URL
     * @param options WebSocket 연결 옵션
     */
    connect(url: string, options?: unknown): void

    /**
     * WebSocket 이벤트 핸들러를 설정합니다.
     * @param event 이벤트 이름 (open, message, close, error 등)
     * @param callback 이벤트 발생 시 호출될 콜백 함수
     */
    on(event: string, callback: (...args: any[]) => void): void

    /**
     * WebSocket을 통해 데이터를 전송합니다.
     * @param data 전송할 데이터
     */
    send(data: unknown): void

    /**
     * WebSocket 연결을 닫습니다.
     */
    close(): void
}
