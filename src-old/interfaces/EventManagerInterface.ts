import { EventFilter } from "../types/events"

// src/interfaces/EventManagerInterface.ts
export interface EventManagerInterface {
    publish(event: any): Promise<void>
    subscribe(event: string, handler: Function, filter?: EventFilter): void
    unsubscribe(event: string, handler: Function): void
}
