// src/interfaces/StateManagerInterface.ts
export interface StateManagerInterface {
    changeState(id: string, state: string): Promise<void>
}
