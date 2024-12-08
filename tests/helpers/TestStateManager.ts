/**
 * Path: tests/helpers/TestStateManager.ts
 * 상태 전이 테스트를 위한 테스트용 상태 관리 클래스
 */

import { ConnectorState, validStateTransitions } from "../../src/states/types";
import { WebSocketError, ErrorCode } from "../../src/errors/types";

export class TestStateManager {
    private currentState: ConnectorState = ConnectorState.INITIAL;
    private stateHistory: Array<{ state: ConnectorState; timestamp: number }> =
        [];

    setState(newState: ConnectorState): void {
        if (!this.isValidTransition(this.currentState, newState)) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid transition from ${this.currentState} to ${newState}`
            );
        }

        this.stateHistory.push({
            state: this.currentState,
            timestamp: Date.now(),
        });
        this.currentState = newState;
    }

    isValidTransition(from: ConnectorState, to: ConnectorState): boolean {
        return validStateTransitions[from]?.includes(to) ?? false;
    }

    getCurrentState(): ConnectorState {
        return this.currentState;
    }

    getStateHistory(): Array<{ state: ConnectorState; timestamp: number }> {
        return this.stateHistory;
    }
}
