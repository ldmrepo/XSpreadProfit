import Redis from "ioredis"

const redis = new Redis({
    host: "exchange-a-pv9qz2.serverless.apn2.cache.amazonaws.com",
    port: 6379,
    tls: {},
    connectTimeout: 30000,
    enableOfflineQueue: true, // 오프라인 큐 활성화
    retryStrategy: (times) => {
        console.log(`Retry attempt ${times}`)
        if (times > 3) {
            return null // 3번 시도 후 중단
        }
        return Math.min(times * 1000, 5000)
    },
})

// 연결 이벤트 리스너
redis.on("error", (err) => {
    console.error("Redis Error:", err)
})

redis.on("connect", () => {
    console.log("Connected to MemoryDB")
})

redis.on("ready", () => {
    console.log("MemoryDB is ready to accept commands")
})

redis.on("end", () => {
    console.log("Connection ended")
})

// 연결 테스트
async function testConnection() {
    try {
        console.log("Attempting to connect...")

        // 연결 상태 확인
        const isConnected =
            redis.status === "ready" || redis.status === "connect"
        console.log("Connection status:", redis.status)

        if (isConnected) {
            await redis.ping()
            console.log("PING successful!")

            // 간단한 쓰기/읽기 테스트
            await redis.set("test", "hello")
            const result = await redis.get("test")
            console.log("Read/Write test result:", result)
        } else {
            console.log("Not connected to Redis")
        }
    } catch (error) {
        console.error("Connection test failed:", error)
    } finally {
        try {
            // 연결 상태 확인 후 종료
            if (redis.status !== "end") {
                await redis.disconnect()
            }
            console.log("Cleanup completed")
        } catch (error) {
            console.error("Error during cleanup:", error)
        }
    }
}

// 프로세스 종료 처리
process.on("SIGTERM", async () => {
    try {
        await redis.disconnect()
    } catch (error) {
        console.error("Error during shutdown:", error)
    } finally {
        process.exit(0)
    }
})

testConnection().catch((error) => {
    console.error("Unhandled error:", error)
    process.exit(1)
})
