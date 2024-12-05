/**
 * Path: src/types/state.ts
 * 상태 관리 통합
 */

import { ErrorCode, WebSocketError } from "../errors/types";
import { ConnectorState } from "../states/types";

export abstract class StateManager {
    protected currentState: ConnectorState;
    protected stateTimestamp: number;

    protected setState(newState: ConnectorState): void {
        if (!this.isValidStateTransition(this.currentState, newState)) {
            throw new WebSocketError(
                ErrorCode.INVALID_STATE,
                `Invalid transition: ${this.currentState} -> ${newState}`
            );
        }
        this.updateState(newState);
    }

    protected abstract isValidStateTransition(
        from: ConnectorState,
        to: ConnectorState
    ): boolean;

    protected abstract updateState(newState: ConnectorState): void;
}
