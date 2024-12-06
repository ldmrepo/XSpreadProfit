/**
 * Path: tests/collectors/ConnectorManager.test.ts
 * ConnectorManager 테스트
 */

import { ConnectorManager } from "../../src-dev/collectors/ConnectorManager"
import { MockWebSocketClient } from "../websocket/MockWebSocketClient"
import { WebSocketManager } from "../../src-dev/websocket/WebSocketManager"
import { ErrorCode, WebSocketError } from "../../src-dev/errors/types"
import { ConnectorState } from "../../src-dev/states/types"
import {
    WebSocketConfig,
    WebSocketMessage,
} from "../../src-dev/websocket/types"
import { IExchangeConnector } from "../../src-dev/collectors/types"

// Mock ExchangeConnector
import { EventEmitter } from "events"

class MockExchangeConnector extends EventEmitter implements IExchangeConnector {
    private state = ConnectorState.INITIAL
    private metrics = {
        timestamp: Date.now(),
        status: this.state,
        messageCount: 0,
        errorCount: 0,
        id: "",
        symbols: [],
        state: this.state,
    }

    constructor(private id: string, private symbols: string[]) {
        super()
    }

    async start(): Promise<void> {
        this.setState(ConnectorState.CONNECTING)
        this.setState(ConnectorState.SUBSCRIBED)
    }

    async stop(): Promise<void> {
        this.setState(ConnectorState.DISCONNECTED)
    }

    setState(newState: ConnectorState): void {
        const previousState = this.state
        this.state = newState
        this.emit("stateChange", { previousState, currentState: newState })
    }

    getId(): string {
        return this.id
    }

    getState(): ConnectorState {
        return this.state
    }

    getMetrics() {
        return { ...this.metrics, state: this.state }
    }
}

// Mock createConnector function
const mockCreateConnector: (
    id: string,
    symbols: string[],
    config: WebSocketConfig
) => IExchangeConnector = (id, symbols) =>
    new MockExchangeConnector(id, symbols)

describe("ConnectorManager", () => {
    let manager: ConnectorManager

    beforeEach(() => {
        manager = new ConnectorManager(
            "testExchange",
            { url: "ws://mock" },
            mockCreateConnector
        )
    })

    test("1개의 심볼에서 상태 전환 확인", async () => {
        const stateChangeHandler = jest.fn()
        manager.on("connectorStateChange", stateChangeHandler)

        const symbols = ["BTC/USD"]
        await manager.initialize(symbols)

        const connectorIds = manager.getConnectorIds()
        expect(connectorIds).toHaveLength(1)

        const calls = stateChangeHandler.mock.calls
        expect(calls.length).toBeGreaterThanOrEqual(2) // CONNECTING → SUBSCRIBED

        // 상태 전환 확인
        expect(calls[0][0]).toMatchObject({
            connectorId: "testExchange-0",
            event: {
                previousState: ConnectorState.INITIAL,
                currentState: ConnectorState.CONNECTING,
            },
        })
        expect(calls[1][0]).toMatchObject({
            connectorId: "testExchange-0",
            event: {
                previousState: ConnectorState.CONNECTING,
                currentState: ConnectorState.SUBSCRIBED,
            },
        })
    })

    test("여러 심볼 그룹에서 상태 전환 확인", async () => {
        const stateChangeHandler = jest.fn()
        manager.on("connectorStateChange", stateChangeHandler)

        const symbols = Array.from({ length: 200 }, (_, i) => `SYMBOL_${i}`)
        await manager.initialize(symbols)

        const connectorIds = manager.getConnectorIds()
        expect(connectorIds).toHaveLength(2) // 200 symbols → 2 connectors

        const calls = stateChangeHandler.mock.calls
        expect(calls.length).toBeGreaterThanOrEqual(4) // 각 Connector의 CONNECTING → SUBSCRIBED

        // 첫 번째 Connector 상태 전환 확인
        expect(calls[0][0]).toMatchObject({
            connectorId: "testExchange-0",
            event: {
                previousState: ConnectorState.INITIAL,
                currentState: ConnectorState.CONNECTING,
            },
        })
        expect(calls[1][0]).toMatchObject({
            connectorId: "testExchange-0",
            event: {
                previousState: ConnectorState.CONNECTING,
                currentState: ConnectorState.SUBSCRIBED,
            },
        })

        // 두 번째 Connector 상태 전환 확인
        expect(calls[2][0]).toMatchObject({
            connectorId: "testExchange-1",
            event: {
                previousState: ConnectorState.INITIAL,
                currentState: ConnectorState.CONNECTING,
            },
        })
        expect(calls[3][0]).toMatchObject({
            connectorId: "testExchange-1",
            event: {
                previousState: ConnectorState.CONNECTING,
                currentState: ConnectorState.SUBSCRIBED,
            },
        })
    })

    test("심볼 배열을 100개 단위로 분할하는지 확인", () => {
        const symbols = Array.from({ length: 250 }, (_, i) => `SYMBOL_${i}`)

        // groupSymbols 호출
        const groups = manager["groupSymbols"](symbols) // private 메서드 접근

        // 그룹 크기 검증
        expect(groups).toHaveLength(3) // 250개 심볼 → 3개의 그룹
        expect(groups[0]).toHaveLength(100) // 첫 번째 그룹
        expect(groups[1]).toHaveLength(100) // 두 번째 그룹
        expect(groups[2]).toHaveLength(50) // 세 번째 그룹 (100보다 작음)
    })
    test("심볼 배열이 groupSize의 배수일 때 정확히 그룹화되는지 확인", () => {
        const symbols = Array.from({ length: 300 }, (_, i) => `SYMBOL_${i}`)

        const groups = manager["groupSymbols"](symbols)

        expect(groups).toHaveLength(3) // 300개 심볼 → 3개의 그룹
        groups.forEach((group) => expect(group).toHaveLength(100)) // 모든 그룹의 크기는 100
    })
    test("심볼 배열이 groupSize보다 작을 때 전체가 하나의 그룹으로 반환되는지 확인", () => {
        const symbols = Array.from({ length: 50 }, (_, i) => `SYMBOL_${i}`)

        const groups = manager["groupSymbols"](symbols)

        expect(groups).toHaveLength(1) // 1개의 그룹만 생성
        expect(groups[0]).toHaveLength(50) // 그룹 크기 확인
    })
    test("심볼 배열이 비어 있을 때 빈 그룹 배열 반환", () => {
        const symbols: string[] = []

        const groups = manager["groupSymbols"](symbols)

        expect(groups).toHaveLength(0) // 빈 그룹 배열 반환
    })
    test("심볼 배열이 매우 큰 경우에도 효율적으로 그룹화되는지 확인", () => {
        const symbols = Array.from({ length: 10000 }, (_, i) => `SYMBOL_${i}`)

        const groups = manager["groupSymbols"](symbols)

        expect(groups).toHaveLength(100) // 10,000개 심볼 → 100개의 그룹
        groups.forEach((group) => expect(group).toHaveLength(100)) // 모든 그룹 크기 100
    })
    test("stop()을 연속적으로 호출할 때의 처리 확인", async () => {
        const symbols = ["BTC/USD", "ETH/USD"]
        await manager.initialize(symbols)

        await manager.stop()
        await expect(manager.stop()).resolves.not.toThrow() // 중복 호출이 에러를 발생시키지 않음

        const groups = manager.getConnectorIds()
        expect(groups).toHaveLength(0) // 모든 커넥터가 중지됨
    })
})

describe("MockExchangeConnector 이벤트 상태 변경 테스트", () => {
    let connector: MockExchangeConnector

    beforeEach(() => {
        connector = new MockExchangeConnector("testConnector", [
            "BTC/USD",
            "ETH/USD",
        ])
    })

    test("INITIAL → CONNECTING → SUBSCRIBED 상태 전환 이벤트 발생", async () => {
        const stateChangeHandler = jest.fn()
        connector.on("stateChange", stateChangeHandler)

        // 상태 변경: INITIAL → CONNECTING → SUBSCRIBED
        await connector.start()

        // 이벤트가 2번 호출되었는지 확인
        expect(stateChangeHandler).toHaveBeenCalledTimes(2)

        // 첫 번째 이벤트: INITIAL → CONNECTING
        expect(stateChangeHandler.mock.calls[0][0]).toMatchObject({
            connectorId: "testConnector",
            event: {
                previousState: ConnectorState.INITIAL,
                currentState: ConnectorState.CONNECTING,
            },
        })

        // 두 번째 이벤트: CONNECTING → SUBSCRIBED
        expect(stateChangeHandler.mock.calls[1][0]).toMatchObject({
            connectorId: "testConnector",
            event: {
                previousState: ConnectorState.CONNECTING,
                currentState: ConnectorState.SUBSCRIBED,
            },
        })
    })

    // test("CONNECTING → ERROR 상태 전환 이벤트 발생", async () => {
    //     const stateChangeHandler = jest.fn()
    //     connector.on("stateChange", stateChangeHandler)

    //     // 상태 변경: INITIAL → CONNECTING
    //     connector.setState(ConnectorState.CONNECTING)

    //     // 상태 변경: CONNECTING → ERROR
    //     connector.setState(ConnectorState.ERROR)

    //     // 이벤트가 2번 호출되었는지 확인
    //     expect(stateChangeHandler).toHaveBeenCalledTimes(2)

    //     // 첫 번째 이벤트: INITIAL → CONNECTING
    //     expect(stateChangeHandler.mock.calls[0][0]).toMatchObject({
    //         connectorId: "testConnector",
    //         event: {
    //             previousState: ConnectorState.INITIAL,
    //             currentState: ConnectorState.CONNECTING,
    //         },
    //     })

    //     // 두 번째 이벤트: CONNECTING → ERROR
    //     expect(stateChangeHandler.mock.calls[1][0]).toMatchObject({
    //         connectorId: "testConnector",
    //         event: {
    //             previousState: ConnectorState.CONNECTING,
    //             currentState: ConnectorState.ERROR,
    //         },
    //     })
    // })

    // test("DISCONNECTED 상태에서 재연결", async () => {
    //     const stateChangeHandler = jest.fn()
    //     connector.on("stateChange", stateChangeHandler)

    //     // 상태 변경: INITIAL → CONNECTING → SUBSCRIBED
    //     await connector.start()

    //     // 상태 변경: SUBSCRIBED → DISCONNECTED
    //     await connector.stop()

    //     // 상태 변경: DISCONNECTED → CONNECTING → SUBSCRIBED
    //     await connector.start()

    //     // 이벤트가 4번 호출되었는지 확인
    //     expect(stateChangeHandler).toHaveBeenCalledTimes(4)

    //     // 마지막 이벤트: CONNECTING → SUBSCRIBED
    //     expect(stateChangeHandler.mock.calls[3][0]).toMatchObject({
    //         connectorId: "testConnector",
    //         event: {
    //             previousState: ConnectorState.CONNECTING,
    //             currentState: ConnectorState.SUBSCRIBED,
    //         },
    //     })
    // })
})
