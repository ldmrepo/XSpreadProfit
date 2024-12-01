import { StandardData } from "../types/market";

export abstract class ExchangeDataTransformer {
    static transformToStandardFormat(data: any): StandardData {
        throw new Error("This method must be implemented in derived classes.");
    }
}
