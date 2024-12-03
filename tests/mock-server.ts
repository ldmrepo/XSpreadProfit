// src/mock-server.ts
import { WebSocketServer, WebSocket } from "ws"

const PORT = 8080

// WebSocket 서버 생성
const wss = new WebSocketServer({ port: PORT })

console.log(`WebSocket 서버가 ${PORT} 포트에서 실행 중입니다.`)

wss.on("connection", (ws: WebSocket) => {
    console.log("클라이언트 연결됨")

    // 메시지 수신 처리
    ws.on("message", (message: string) => {
        console.log(`수신한 메시지: ${message}`)

        // Echo 메시지 전송
        ws.send(`서버에서 수신: ${message}`)
    })

    // 연결 종료 처리
    ws.on("close", () => {
        console.log("클라이언트 연결 종료")
    })

    // 에러 처리
    ws.on("error", (error: Error) => {
        console.error(`WebSocket 에러: ${error.message}`)
    })

    // 초기 메시지 전송
    // ws.send("서버에 연결되었습니다.")
})
