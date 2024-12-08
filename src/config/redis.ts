/**
 * Path: src/config/redis.ts
 */
import { RedisConfig } from "../storage/redis/types";

export const redisConfig: RedisConfig = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: "redispass", //process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
};
