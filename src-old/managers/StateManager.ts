// src/managers/StateManager.ts
/**
 * StateManager
 *
 * 시스템 컴포넌트의 상태를 관리하고 상태 변화를 추적하는 매니저
 * - 컴포넌트 상태 관리
 * - 상태 변경 이력 관리
 * - 상태 전이 규칙 검증
 * - 상태 모니터링
 */

import { Logger } from "../utils/logger"
import EventManager from "./EventManager"
import {
    State,
    StateTransition,
    StateHistory,
    ComponentState,
} from "../types/state"
import { StateManagerConfig } from "../types/config"
import { StateManagerInterface } from "../interfaces/StateManagerInterface"

class StateManager implements StateManagerInterface {
    private static instance: StateManager
    private componentStates: Map<string, ComponentState>
    private stateHistory: Map<string, StateHistory[]>
    private transitionRules: Map<string, Set<string>>
    private eventManager: EventManager
    private logger: Logger

    private constructor() {
        this.componentStates = new Map()
        this.stateHistory = new Map()
        this.transitionRules = new Map()
        this.eventManager = EventManager.getInstance()
        this.logger = Logger.getInstance("StateManager")
    }

    static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager()
        }
        return StateManager.instance
    }

    async initialize(config: StateManagerConfig): Promise<void> {
        try {
            await this.initializeTransitionRules()
            this.logger.info("StateManager initialized successfully")
        } catch (error) {
            this.logger.error("Failed to initialize StateManager", error)
            throw error
        }
    }

    async changeState(componentId: string, newState: State): Promise<void> {
        try {
            const currentState = this.componentStates.get(componentId)

            if (currentState) {
                this.validateStateTransition(currentState.state, newState)
            }

            const stateChange: ComponentState = {
                componentId,
                state: newState,
                timestamp: Date.now(),
                metadata: {},
            }

            await this.updateState(componentId, stateChange)
            await this.recordStateHistory(componentId, stateChange)
            await this.notifyStateChange(componentId, stateChange)

            this.logger.debug(`State changed for ${componentId}: ${newState}`)
        } catch (error) {
            this.logger.error(
                `Failed to change state for ${componentId}`,
                error
            )
            throw error
        }
    }

    getState(componentId: string): ComponentState | undefined {
        return this.componentStates.get(componentId)
    }

    getStateHistory(componentId: string): StateHistory[] {
        return this.stateHistory.get(componentId) || []
    }

    validateStateTransition(fromState: State, toState: State): boolean {
        const validTransitions = this.transitionRules.get(fromState)
        if (!validTransitions || !validTransitions.has(toState)) {
            throw new Error(
                `Invalid state transition: ${fromState} -> ${toState}`
            )
        }
        return true
    }

    private async updateState(
        componentId: string,
        stateChange: ComponentState
    ): Promise<void> {
        this.componentStates.set(componentId, stateChange)
    }

    private async recordStateHistory(
        componentId: string,
        stateChange: ComponentState
    ): Promise<void> {
        if (!this.stateHistory.has(componentId)) {
            this.stateHistory.set(componentId, [])
        }

        const history = this.stateHistory.get(componentId)!
        history.push({
            ...stateChange,
            timestamp: Date.now(),
        })

        // Keep only last 100 state changes
        if (history.length > 100) {
            history.shift()
        }
    }

    private async notifyStateChange(
        componentId: string,
        stateChange: ComponentState
    ): Promise<void> {
        await this.eventManager.publish({
            type: "SYSTEM.STATE_CHANGE",
            payload: stateChange,
            timestamp: Date.now(),
            source: "StateManager",
        })
    }

    private async initializeTransitionRules(): Promise<void> {
        // 기본 상태 전이 규칙 설정
        const defaultRules: Map<string, Set<string>> = new Map([
            ["INIT", new Set(["STARTING"])],
            ["STARTING", new Set(["RUNNING", "ERROR"])],
            ["RUNNING", new Set(["PAUSED", "STOPPING", "ERROR"])],
            ["PAUSED", new Set(["RUNNING", "STOPPING", "ERROR"])],
            ["STOPPING", new Set(["STOPPED", "ERROR"])],
            ["ERROR", new Set(["STARTING", "STOPPED"])],
            ["STOPPED", new Set(["STARTING"])],
        ])

        this.transitionRules = defaultRules
    }

    getValidTransitions(state: State): Set<string> {
        return this.transitionRules.get(state) || new Set()
    }

    getAllComponentStates(): Map<string, ComponentState> {
        return new Map(this.componentStates)
    }
}

export default StateManager
