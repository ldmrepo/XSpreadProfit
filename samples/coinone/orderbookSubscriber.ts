/**
 * 파일 경로: src/coinone/orderbookSubscriber.ts
 * 기능 요약: 코인원 오더북 구독 및 PING 메시지를 활용한 커넥션 관리
 * Import: Node.js WebSocket 라이브러리
 */

import WebSocket from "ws";

// 코인원 WebSocket 서버 URL
const COINONE_WS_URL = "wss://stream.coinone.co.kr";

// PING 간격 (밀리초)
const PING_INTERVAL = 25 * 60 * 1000; // 25분 (30분 제한보다 여유있게 설정)

// 구독 요청 데이터 형식 정의
interface CoinoneSubscription {
    request_type: string;
    channel: string;
    topic: {
        quote_currency: string;
        target_currency: string;
    };
}

// 구독 요청 생성 함수
function formatSubscriptionRequest(symbols: string[]): CoinoneSubscription[] {
    if (!Array.isArray(symbols) || symbols.length === 0) {
        throw new Error("symbols 배열은 비어 있을 수 없습니다.");
    }

    return symbols.map((symbol) => ({
        request_type: "SUBSCRIBE",
        channel: "ORDERBOOK",
        topic: {
            quote_currency: "KRW",
            target_currency: symbol.toUpperCase(),
        },
    }));
}

// WebSocket 연결 및 데이터 처리
function connectOrderbookWebSocket(symbols: string[]) {
    const ws = new WebSocket(COINONE_WS_URL);

    let pingInterval: NodeJS.Timeout;

    ws.on("open", () => {
        console.log("WebSocket 연결 성공");

        // 구독 요청 생성 및 전송
        const subscriptionRequests = formatSubscriptionRequest(symbols);
        subscriptionRequests.forEach((request) => {
            ws.send(JSON.stringify(request));
            console.log("구독 요청 전송:", request);
        });

        // PING 메시지 주기적으로 전송
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                const pingMessage = { request_type: "PING" };
                ws.send(JSON.stringify(pingMessage));
                console.log("PING 전송:", pingMessage);
            }
        }, PING_INTERVAL);
    });

    ws.on("message", (data) => {
        // 수신 데이터 처리
        const message = JSON.parse(data.toString());
        if (message.response_type === "PONG") {
            console.log("PONG 응답 수신");
        } else if (message.channel === "ORDERBOOK") {
            console.log(
                "오더북 데이터 수신:",
                JSON.stringify(message, null, 2)
            );
        } else {
            console.log("수신 메시지:", message);
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket 에러:", error);
    });

    ws.on("close", () => {
        console.log("WebSocket 연결 종료");
        clearInterval(pingInterval); // PING 전송 중단
        // 필요 시 재연결 로직 추가
        setTimeout(() => connectOrderbookWebSocket(symbols), 5000); // 5초 후 재연결
    });
}

// 실행 함수
function main() {
    const symbols = ["BTC", "ETH", "XRP"]; // 구독할 종목 리스트
    connectOrderbookWebSocket(symbols);
}

main();
