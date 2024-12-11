/**
 * 파일 경로: src/bithumb/orderbook.ts
 * 기능 요약: 빗썸 호가(Orderbook) API WebSocket 클라이언트 (PING/PONG 포함)
 * Import: Node.js WebSocket 라이브러리
 */

import WebSocket from "ws";

// WebSocket 연결 URL
const BITTHUMB_WS_URL = "wss://pubwss.bithumb.com/pub/ws";

// PING 간격 (밀리초)
const PING_INTERVAL = 10000; // 10초

// 요청 생성 함수
function createOrderbookRequest(
    codes: string[],
    level: number = 1,
    isOnlySanpshot: boolean = false,
    isOnlyRealtime: boolean = false
): object[] {
    return [
        {
            ticket: "unique_ticket_id", // 클라이언트 요청 식별자
        },
        {
            type: "orderbook", // 요청 타입
            codes: codes, // 요청 마켓 코드 리스트 (대문자)
            level: level, // 호가 모아보기 단위 (기본값: 1)
            isOnlySanpshot: isOnlySanpshot, // 스냅샷 데이터만 요청 여부
            isOnlyRealtime: isOnlyRealtime, // 실시간 데이터만 요청 여부
        },
        {
            format: "DEFAULT", // 데이터 포맷
        },
    ];
}

// WebSocket 연결 및 데이터 처리
function connectOrderbookWebSocket() {
    const ws = new WebSocket(BITTHUMB_WS_URL);

    let pingInterval: NodeJS.Timeout;

    ws.on("open", () => {
        console.log("WebSocket 연결 성공");

        // 요청 전송
        const request = createOrderbookRequest(["KRW-BTC", "KRW-ETH"], 10);
        ws.send(JSON.stringify(request));
        console.log("요청 전송:", request);

        // PING 주기적으로 전송
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping(); // PING 전송
                console.log("PING 전송");
            }
        }, PING_INTERVAL);
    });

    ws.on("pong", () => {
        // PONG 응답 처리
        console.log("PONG 응답 수신");
    });

    ws.on("message", (data) => {
        // 수신 데이터 처리
        const message = JSON.parse(data.toString());
        if (message.status === "UP") {
            console.log("서버 상태: UP");
        } else {
            console.log("수신 데이터:", message);
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket 에러:", error);
    });

    ws.on("close", () => {
        console.log("WebSocket 연결 종료");
        clearInterval(pingInterval); // PING 전송 중지
        // 연결이 종료되면 재연결 로직 실행
        setTimeout(connectOrderbookWebSocket, 5000); // 5초 후 재연결
    });
}

// WebSocket 연결 시작
connectOrderbookWebSocket();
