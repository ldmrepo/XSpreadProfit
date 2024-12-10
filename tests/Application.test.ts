import { ErrorHandler } from "../src/errors/ErrorHandler"
import { IConfigLoader } from "../src/config/IConfigLoader"
import { IBookTickerStorage } from "../src/storage/redis/types"
import { Application } from "../src/main"
import { MockWebSocketManager } from "./mock/MockWebSocketManager"

import path from "path"
import fs from "fs"
import { ExchangeDataInitializer } from "../src/initializers/ExchangeDataInitializer"
import Redis from "ioredis"

jest.mock("../src/websocket/WebSocketManager", () => {
    const { MockWebSocketManager } = jest.requireActual(
        "./mock/MockWebSocketManager"
    )
    return {
        WebSocketManager: MockWebSocketManager,
    }
})

// test/Application.test.ts
describe("Application", () => {
    let mockConfigLoader: jest.Mocked<IConfigLoader>
    let mockErrorHandler: jest.Mocked<ErrorHandler>
    let mockStorage: jest.Mocked<IBookTickerStorage>
    let app: Application
    let testSymbols: string[]

    beforeAll(() => {
        jest.setTimeout(10000) // 타임아웃 설정

        // 심볼 데이터를 파일에서 읽음
        const filePath = path.join(__dirname, "/data/testSymbols.json")
        testSymbols = JSON.parse(fs.readFileSync(filePath, "utf8"))
    })
    beforeEach(() => {
        mockConfigLoader = {
            loadConfig: jest.fn().mockReturnValue({
                exchanges: [
                    {
                        name: "binance",
                        wsUrl: "ws://test",
                        streamLimit: 100,
                        symbols: testSymbols,
                    },
                ],
                redis: {
                    host: "localhost",
                    port: 6379,
                },
            }),
        }

        mockErrorHandler = {
            handleError: jest.fn(),
            handleFatalError: jest.fn(),
        } as any

        mockStorage = {
            saveBookTicker: jest.fn(),
            getBookTicker: jest.fn(),
            getLatestBookTickers: jest.fn(),
            cleanup: jest.fn(),
        }
        const redis = new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            password: process.env.REDIS_PASSWORD,
        })
        const exchangeInitializer = new ExchangeDataInitializer(
            redis,
            mockLogger
        )
        app = new Application(mockConfigLoader, mockErrorHandler, mockStorage)
    })

    afterEach(async () => {
        await app.shutdown()
    })

    test("should start collectors for configured exchanges", async () => {
        await app.start()

        const collectors = app.getCollectors()
        expect(collectors.size).toBe(1)
        expect(collectors.has("binance")).toBe(true)
        expect(app.getStatus()).toBe("running")
    })

    // test("should cleanup resources on shutdown", async () => {
    //     await app.start();
    //     await app.shutdown();

    //     expect(mockStorage.cleanup).toHaveBeenCalled();
    //     expect(app.getStatus()).toBe("stopped");
    // });
})
