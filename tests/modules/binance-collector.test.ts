/**
 * @file tests/modules/binance-collector.test.ts
 */

import { BinanceCollector } from "../../src/modules/binance-collector";
import WebSocket from "ws";
import axios from "axios";
import { StateType } from "../../src/types";

jest.mock("ws", () => {
    const EventEmitter = require("events");
    class MockWebSocket extends EventEmitter {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = MockWebSocket.OPEN;
        url: string;
        constructor(url: string) {
            super();
            this.url = url;
            this.readyState = MockWebSocket.OPEN;
            this.emit("open");
        }
        send(data: any) {
            // send 메서드 Mock
            // 빈 함수로 둡니다.
        }
        close() {
            this.readyState = MockWebSocket.CLOSED;
            this.emit("close");
        }
        ping() {
            // ping 메서드 Mock
        }
    }
    return {
        __esModule: true,
        default: MockWebSocket,
    };
});

jest.mock("axios");

describe("BinanceCollector", () => {
    let collector: BinanceCollector;
    const mockAxios = axios as jest.Mocked<typeof axios>;

    const config = {
        id: "binance-collector-1",
        wsUrl: "wss://mock-binance-websocket",
        restUrl: "https://mock-binance-rest",
        maxSymbolsPerGroup: 2,
    };

    beforeEach(async () => {
        collector = new BinanceCollector(config);
        await collector.start();

        jest.clearAllMocks();
    });

    afterEach(async () => {
        if (collector.getState().type === StateType.RUNNING) {
            await collector.stop();
        }
        // 모든 비동기 작업이 완료될 때까지 기다립니다.
        await new Promise((resolve) => setImmediate(resolve));
    });

    it("WebSocket 연결 성공 시 구독 그룹에 데이터 전송", async () => {
        const symbols = ["BTCUSDT", "ETHUSDT"];
        const streams = symbols.map((s) => `${s.toLowerCase()}@depth`);

        // collector의 send 메서드를 스파이합니다.
        const sendSpy = jest.spyOn(collector as any, "send");

        await collector.subscribe(symbols);

        // send 메서드가 호출되었는지 확인
        expect(sendSpy).toHaveBeenCalledWith({
            method: "SUBSCRIBE",
            params: streams,
            id: expect.any(Number),
        });
    });

    it("WebSocket 메시지 수신 시 데이터 처리", async () => {
        const mockEmit = jest.spyOn(collector, "emit");

        const symbols = ["BTCUSDT"];
        await collector.subscribe(symbols);

        const wsInstance = (collector as any).ws as WebSocket;

        // Mock 메시지 데이터
        const mockData = {
            stream: "btcusdt@depth",
            data: {
                e: "depthUpdate",
                E: Date.now(),
                s: "BTCUSDT",
                U: 157,
                u: 160,
                b: [["50000.0", "1.0"]],
                a: [["50001.0", "0.5"]],
            },
        };

        // WebSocket "message" 이벤트 발생
        wsInstance.emit("message", JSON.stringify(mockData));

        expect(mockEmit).toHaveBeenCalledWith(
            "data",
            expect.objectContaining({
                exchange: "binance",
                // symbol: "BTC",
                bids: expect.any(Array),
                asks: expect.any(Array),
                timestamp: expect.any(Number),
            })
        );
    });

    it("WebSocket 연결 실패 시 복구 시도", async () => {
        const wsInstance = (collector as any).ws as WebSocket;

        // WebSocket "error" 이벤트 발생
        wsInstance.emit("error", new Error("Connection error"));

        // 연결 상태가 "ERROR"로 변경되었는지 확인
        expect(collector.getMetrics().connection.status).toBe("ERROR");

        // 재연결을 위해 충분한 시간 대기
        await new Promise((resolve) =>
            setTimeout(resolve, collector.retryConfig.initialDelay + 1000)
        );

        // 새로운 WebSocket 인스턴스가 생성되었는지 확인
        const newWsInstance = (collector as any).ws as WebSocket;
        expect(newWsInstance).toBeDefined();
        expect(newWsInstance).not.toBe(wsInstance);

        // Collector의 상태를 확인하고, RUNNING 상태일 때만 stop 호출
        if (collector.getState().type === StateType.RUNNING) {
            await collector.stop();
        }
    });

    it("구독 그룹 내 데이터 그룹화", () => {
        // groupSymbols 메서드를 protected로 변경하여 접근 가능
        const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT"];
        const groups = (collector as any).groupSymbols(symbols);

        expect(groups.length).toBeGreaterThan(0);
        groups.forEach((group: string[]) => {
            expect(group.length).toBeLessThanOrEqual(config.maxSymbolsPerGroup);
        });
    });

    it("구독 해제 시 WebSocket 연결 종료", async () => {
        const symbols = ["BTCUSDT"];
        await collector.subscribe(symbols);

        const wsInstance = (collector as any).ws as WebSocket;
        const closeSpy = jest.spyOn(wsInstance, "close");

        await collector.unsubscribe();

        expect(closeSpy).toHaveBeenCalled(); // 모든 구독 해제 시 연결 종료
    });

    it("구독 그룹의 잘못된 데이터 처리 시 에러 발생", async () => {
        const consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});

        const mockEmit = jest.spyOn(collector, "emit");

        const symbols = ["BTCUSDT"];
        await collector.subscribe(symbols);

        const wsInstance = (collector as any).ws as WebSocket;

        // 잘못된 데이터 전송
        wsInstance.emit("message", "Invalid JSON String");

        expect(mockEmit).not.toHaveBeenCalledWith("data", expect.anything());

        // 에러 로그가 호출되었는지 확인
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining("Failed to parse message:"),
            expect.any(SyntaxError)
        );

        // 모의한 console.error 복원
        consoleErrorSpy.mockRestore();
    });

    it("WebSocket 연결 실패 시 REST API를 통해 데이터 수집 시도", async () => {
        const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({
            data: {
                // 모의 REST API 응답 데이터
                lastUpdateId: 1027024,
                bids: [["4.00000000", "431.00000000"]],
                asks: [["4.00000200", "12.00000000"]],
            },
        });

        await collector.start(); // Collector 시작

        // 'BTCUSDT' 심볼을 구독합니다.
        await collector.subscribe(["BTCUSDT"]);

        const wsInstance = (collector as any).ws as WebSocket;

        // WebSocket "error" 이벤트 발생
        wsInstance.emit("error", new Error("Connection error"));

        // axios.get이 호출될 때까지 대기
        await new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                if (axiosGetSpy.mock.calls.length > 0) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 10);
            // 타임아웃 설정 (예: 1초)
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error("axios.get was not called in time"));
            }, 1000);
        });

        // REST API가 호출되었는지 확인
        expect(axiosGetSpy).toHaveBeenCalledWith(
            `${collector.restUrl}/api/v3/depth`,
            {
                params: {
                    symbol: "BTCUSDT",
                    limit: 5,
                },
            }
        );

        // 모의한 axios.get 복원
        axiosGetSpy.mockRestore();
    });
});
