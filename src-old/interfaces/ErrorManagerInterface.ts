import { SystemError } from "errors"

// src/interfaces/ErrorManagerInterface.ts
export interface ErrorManagerInterface {
    handleError(error: Omit<SystemError, "id">): void
}
