import { AppConfig } from "./types";

/**
 * Path: src/config/IConfigLoader.ts
 * IConfigLoader 인터페이스 정의
 */
export interface IConfigLoader {
    loadConfig(): AppConfig;
}
