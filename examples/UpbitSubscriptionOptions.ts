import { BaseSubscriptionOptions } from "./BaseSubscriptionOptions";

export interface UpbitSubscriptionOptions extends BaseSubscriptionOptions {
    level?: number; // 호가 레벨
    isOnlySnapshot?: boolean; // 스냅샷만 요청
    isOnlyRealtime?: boolean; // 실시간 데이터만 요청
}
