import { BaseSubscriptionOptions } from "./BaseSubscriptionOptions";

export interface BinanceSubscriptionOptions extends BaseSubscriptionOptions {
    interval?: string; // 데이터 업데이트 주기 (예: "1m", "5m")
}
