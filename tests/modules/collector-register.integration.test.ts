/**
 * @file tests/integration/collector-register.integration.test.ts
 * @description 통합 테스트: BinanceCollector와 Register 모듈의 연계
 */

import Redis from "ioredis";
import { EventEmitter } from "events";
import { BinanceCollector } from "../../src/modules/binance-collector";
import { Register } from "../../src/modules/register";
import { StandardData } from "../../src/types/market";
import { StateType } from "../../src/types";
import WebSocket from "ws";

// 모듈 모킹
jest.mock("ioredis");
jest.mock("ws");

// 모듈 모킹
jest.mock("ioredis");
jest.mock("ws", () => {
    const EventEmitter = require("events");
    return class WebSocket extends EventEmitter {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = WebSocket.OPEN;
        protocol = "";
        binaryType = "nodebuffer";
        bufferedAmount = 0;
        extensions = "";
        isPaused = false;
        url = "";

        close = jest.fn();
        ping = jest.fn();
        pong = jest.fn();
        send = jest.fn();
        terminate = jest.fn();

        addEventListener = jest.fn();
        removeEventListener = jest.fn();
        dispatchEvent = jest.fn();
    };
});

describe("Collector and Register Integration Test", () => {
    let collector: BinanceCollector;
    let register: Register;
    let redisClient: jest.Mocked<Redis>;
    let wsInstance: WebSocket;

    beforeEach(async () => {
        // Redis 모의 설정
        (Redis as jest.MockedClass<typeof Redis>).mockClear();
        redisClient = new Redis() as jest.Mocked<Redis>;

        redisClient.multi.mockReturnValue({
            rpush: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([]),
        } as any);

        redisClient.ping.mockResolvedValue("PONG");
        redisClient.quit.mockResolvedValue("OK");

        // Register 인스턴스 생성
        register = new Register({
            redisUrl: "redis://localhost:6379",
            batchSize: 2,
            batchInterval: 1000,
            maxRetries: 3,
            maxBufferSize: 10,
            maxDataAge: 5000,
            enableHealthCheck: false, // 테스트 중에는 healthCheck 비활성화
        });

        // Collector 인스턴스 생성
        collector = new BinanceCollector({
            id: "binance",
            wsUrl: "wss://testnet.binance.vision/ws",
            restUrl: "https://testnet.binance.vision",
            maxSymbolsPerGroup: 2,
        });

        // Collector 시작
        await collector.start();

        // Collector의 "data" 이벤트를 Register의 "process" 메서드에 연결
        collector.on("data", (data: StandardData) => {
            register.process(data);
        });

        // 모의된 WebSocket 인스턴스 가져오기
        wsInstance = (WebSocket as jest.MockedClass<typeof WebSocket>).mock
            .instances[0];
    });

    afterEach(async () => {
        // Collector와 Register 정리
        if (collector.getState().type === StateType.RUNNING) {
            await collector.stop();
        }
        await register.shutdown();
    });

    test("Collector에서 수집된 데이터가 Register를 통해 Redis에 저장되어야 합니다.", async () => {
        // 'BTCUSDT' 심볼을 구독합니다.
        await collector.subscribe(["BTCUSDT"]);

        // 모의 WebSocket 메시지 생성
        const mockMessage = JSON.stringify({
            stream: "btcusdt@depth",
            data: {
                e: "depthUpdate",
                E: Date.now(),
                s: "BTCUSDT",
                U: 123456789,
                u: 123456790,
                b: [["50000.00", "0.1"]],
                a: [["50010.00", "0.2"]],
            },
        });

        // WebSocket "message" 이벤트 발생
        wsInstance.emit("message", mockMessage);

        // 비동기 작업이 완료될 때까지 충분히 대기
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Register가 Redis에 데이터를 저장했는지 확인
        expect(redisClient.multi).toHaveBeenCalled();
        expect(redisClient.multi().rpush).toHaveBeenCalled();
        expect(redisClient.multi().exec).toHaveBeenCalled();
    });

    test("Collector의 WebSocket 연결 실패 시 Register가 데이터를 처리하지 않아야 합니다.", async () => {
        // 'BTCUSDT' 심볼을 구독합니다.
        await collector.subscribe(["BTCUSDT"]);

        // WebSocket "error" 이벤트 발생
        wsInstance.emit("error", new Error("Connection error"));

        // 모의 WebSocket 메시지 생성 (에러 발생 후 데이터 수신)
        const mockMessage = JSON.stringify({
            stream: "btcusdt@depth",
            data: {
                e: "depthUpdate",
                E: Date.now(),
                s: "BTCUSDT",
                U: 123456789,
                u: 123456790,
                b: [["50000.00", "0.1"]],
                a: [["50010.00", "0.2"]],
            },
        });

        // WebSocket "message" 이벤트 발생
        wsInstance.emit("message", mockMessage);

        // 비동기 작업이 완료될 때까지 대기
        await new Promise((resolve) => setImmediate(resolve));

        // Register가 Redis에 데이터를 저장하지 않았는지 확인
        expect(redisClient.multi).not.toHaveBeenCalled();
    });

    test("Collector에서 잘못된 데이터를 수신했을 때 Register가 오류를 처리해야 합니다.", async () => {
        const errorSpy = jest.spyOn(register, "emit");

        // 'BTCUSDT' 심볼을 구독합니다.
        await collector.subscribe(["BTCUSDT"]);

        // 잘못된 형식의 모의 WebSocket 메시지 생성
        const invalidMockMessage = JSON.stringify({
            stream: "btcusdt@depth",
            data: {
                e: "depthUpdate",
                // 필요한 필드가 누락됨
            },
        });

        // WebSocket "message" 이벤트 발생
        wsInstance.emit("message", invalidMockMessage);

        // 비동기 작업이 완료될 때까지 대기
        await new Promise((resolve) => setImmediate(resolve));

        // Register가 오류 이벤트를 발생시켰는지 확인
        expect(errorSpy).toHaveBeenCalledWith("error", expect.any(Object));
    });
});
