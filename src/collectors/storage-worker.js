const { parentPort, workerData } = require("worker_threads")
const BookTickerStorage = require(workerData.storagePath).BookTickerStorage

const storage = BookTickerStorage.getInstance()
let isProcessing = false

if (parentPort) {
    parentPort.on("message", async (data) => {
        try {
            const storage = BookTickerStorage.getInstance()
            await storage.storeBookTicker(data)
        } catch (error) {
            parentPort.postMessage({
                type: "error",
                error: error.message,
            })
        }
    })
}
