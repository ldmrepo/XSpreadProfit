import WebSocket from "ws";

/**
 * Binance WebSocket Market Streams 제한 사항 요약:
 * 1. 단일 연결은 최대 24시간 유효하며, 이후 자동으로 종료됩니다.
 * 2. Ping-Pong 메커니즘:
 *    - 서버는 3분마다 ping 프레임을 전송합니다.
 *    - 클라이언트는 10분 이내에 pong 프레임을 응답해야 연결 유지가 가능합니다.
 * 3. 단일 WebSocket 연결은 초당 최대 10개의 메시지를 수신할 수 있습니다.
 *    - 초과 시 연결이 종료되며, 반복 시 IP가 차단될 수 있습니다.
 * 4. 한 연결에서 최대 200개의 스트림을 구독할 수 있습니다.
 */

// Binance WebSocket API Base URL
const BASE_URL = "wss://fstream.binance.com/ws";

// WebSocket 연결 생성
const ws = new WebSocket(BASE_URL);

// 요청 ID를 관리하기 위한 변수
let requestId = 1;

// 24시간 타이머 초기화
// const connectionTimeout = 24 * 60 * 60 * 1000; // 24시간(ms)
const connectionTimeout = 3 * 1000; // 24시간(ms)

// Ping-Pong 타이머 초기화
const pingInterval = 3 * 60 * 1000; // 3분(ms)
let pingTimer: NodeJS.Timeout;

// WebSocket 연결 이벤트
ws.on("open", () => {
    console.log("WebSocket connection established.");

    // Ping-Pong 유지
    startPingPong();

    // 여러 심볼 구독
    subscribeToDepthStreams(["btcusdt", "ethusdt"], 5, 100);

    // 24시간 후 연결 종료
    setTimeout(() => {
        console.log("24시간이 경과하여 WebSocket 연결 종료.");
        ws.close();
    }, connectionTimeout);
});

// WebSocket 메시지 수신 이벤트
ws.on("message", (data: string) => {
    const message = JSON.parse(data);
    console.log("Received Data:", message);
});

// WebSocket 에러 이벤트
ws.on("error", (error: Error) => {
    console.error("WebSocket error:", error.message);
});

// WebSocket 종료 이벤트
ws.on("close", () => {
    console.log("WebSocket connection closed.");
    stopPingPong(); // Ping-Pong 타이머 종료
});

// 요청 ID 생성 함수
function getNextRequestId(): number {
    return requestId++;
}

// 여러 심볼 구독 함수
function subscribeToDepthStreams(
    symbols: string[],
    levels: number,
    updateSpeed: number
): void {
    const streams = symbols.map(
        (symbol) => `${symbol}@depth${levels}@${updateSpeed}ms`
    );
    const subscribePayload = {
        method: "SUBSCRIBE",
        params: streams,
        id: getNextRequestId(), // 고유 ID 생성
    };

    ws.send(JSON.stringify(subscribePayload));
    console.log(`Subscribed to streams: ${streams.join(", ")}`);
}

// 여러 심볼 구독 취소 함수
function unsubscribeFromDepthStreams(
    symbols: string[],
    levels: number,
    updateSpeed: number
): void {
    const streams = symbols.map(
        (symbol) => `${symbol}@depth${levels}@${updateSpeed}ms`
    );
    const unsubscribePayload = {
        method: "UNSUBSCRIBE",
        params: streams,
        id: getNextRequestId(), // 고유 ID 생성
    };

    ws.send(JSON.stringify(unsubscribePayload));
    console.log(`Unsubscribed from streams: ${streams.join(", ")}`);
}

// Ping-Pong 처리 함수
function startPingPong(): void {
    pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping(); // Ping 프레임 전송
            console.log("Ping frame sent to maintain connection.");
        }
    }, pingInterval);
}

function stopPingPong(): void {
    if (pingTimer) {
        clearInterval(pingTimer);
        console.log("Ping-Pong timer stopped.");
    }
}
