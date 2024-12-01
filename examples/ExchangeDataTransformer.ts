import { standardData } from "./standardData";

export abstract class ExchangeDataTransformer {
    static transformToStandardFormat(data: any): standardData {
        throw new Error("This method must be implemented in derived classes.");
    }
}
