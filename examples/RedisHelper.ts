import Redis from "ioredis";
import dotenv from "dotenv";
import { standardData } from "./standardData";

// .env 파일 로드
dotenv.config();

/**
 * Redis Helper 클래스
 * Redis 연결 및 데이터 저장/읽기 기능 제공
 */
export class RedisHelper {
    private redis: Redis;

    constructor() {
        const host = process.env.REDIS_HOST || "localhost";
        const port = Number(process.env.REDIS_PORT || 6379);
        const password = process.env.REDIS_PASSWORD || "redispass";
        const db = Number(process.env.REDIS_DB || 0);

        // Redis 클라이언트 생성
        this.redis = new Redis({
            host,
            port,
            password,
            db,
        });

        console.log(`Connected to Redis at ${host}:${port}, DB: ${db}`);
    }

    /**
     * 데이터를 Redis에 저장
     * @param key - Redis 키
     * @param data - 저장할 표준 데이터
     */
    public async saveOrderbook(key: string, data: standardData): Promise<void> {
        try {
            await this.redis.set(key, JSON.stringify(data));
            console.log(`Data saved to Redis under key: ${key}`);
        } catch (error) {
            console.error("Error saving data to Redis:", error);
        }
    }

    /**
     * Redis에서 데이터 읽기
     * @param key - Redis 키
     */
    public async readOrderbook(key: string): Promise<standardData | null> {
        try {
            const data = await this.redis.get(key);
            if (data) {
                return JSON.parse(data) as standardData;
            }
            console.warn(`No data found for key: ${key}`);
        } catch (error) {
            console.error("Error reading data from Redis:", error);
        }
        return null;
    }

    /**
     * Redis 연결 종료
     */
    public closeConnection(): void {
        this.redis.disconnect();
        console.log("Redis connection closed.");
    }
}
