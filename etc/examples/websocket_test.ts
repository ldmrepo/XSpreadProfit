import { BinanceWebSocketClient } from "./BinanceWebSocketClient";
import { BinanceFuturesWebSocketClient } from "./BinanceFuturesWebSocketClient";
import { UpbitWebSocketClient } from "./UpbitWebSocketClient";
import { CoinoneWebSocketClient } from "./CoinoneWebSocketClient";
import { ExchangeWebSocketManager } from "./ExchangeWebSocketManager";

type RunMode = "single" | "all";

// 고정된 실행 모드 설정: "single" 또는 "all"
const RUN_MODE: RunMode = "single"; // "single" 또는 "all"

// 고정된 구독 스트림 설정
const BINANCE_STREAMS = ["btcusdt@depth10@100ms", "ethusdt@depth10@100ms"];
const BINANCE_FUTURES_STREAMS = [
    "btcusdt@depth10@100ms",
    "ethusdt@depth10@100ms",
];
const UPBIT_STREAMS = ["KRW-BTC", "KRW-ETH"];
const COINONE_STREAMS = ["BTC", "ETH"];

/**
 * 단일 거래소 실행
 */
function executeSingleExchange(): void {
    // 거래소 타입 정의
    type TargetExchange = "upbit" | "binance" | "binance_futures" | "coinone";

    // 실행할 거래소 설정
    const TARGET_EXCHANGE = "binance" as TargetExchange; // 타입 단언 사용

    switch (TARGET_EXCHANGE) {
        case "binance":
            console.log("Executing Binance exchange...");
            runBinance();
            break;
        case "binance_futures":
            console.log("Executing Binance Futures exchange...");
            runBinanceFutures();
            break;
        case "upbit":
            console.log("Executing Upbit exchange...");
            runUpbit();
            break;
        case "coinone":
            console.log("Executing Coinone exchange...");
            runCoinone();
            break;
        default:
            console.error(
                "Invalid exchange selected. Please choose 'binance', 'binance_futures', 'upbit', or 'coinone'."
            );
    }
}

/**
 * 모든 거래소를 동시에 실행
 */
function executeAllExchanges(): void {
    console.log("Starting Binance, Binance Futures, Upbit, and Coinone...");

    // Binance 실행
    runBinance();

    // Binance Futures 실행
    runBinanceFutures();

    // Upbit 실행
    runUpbit();

    // Coinone 실행
    runCoinone();

    // 구독 상태 확인 및 재구독 테스트
    testSubscriptionsAndReconnect();
}

/**
 * Binance 실행
 */
function runBinance(): void {
    console.log("Running Binance WebSocket client...");
    const binanceClient = new BinanceWebSocketClient();
    const binanceManager = new ExchangeWebSocketManager(binanceClient);
    binanceManager.connectAndSubscribe(BINANCE_STREAMS);
}

/**
 * Binance Futures 실행
 */
function runBinanceFutures(): void {
    console.log("Running Binance Futures WebSocket client...");
    const binanceFuturesClient = new BinanceFuturesWebSocketClient();
    const binanceFuturesManager = new ExchangeWebSocketManager(
        binanceFuturesClient
    );
    binanceFuturesManager.connectAndSubscribe(BINANCE_FUTURES_STREAMS);
}

/**
 * Upbit 실행
 */
function runUpbit(): void {
    console.log("Running Upbit WebSocket client...");
    const upbitClient = new UpbitWebSocketClient();
    const upbitManager = new ExchangeWebSocketManager(upbitClient);
    upbitManager.connectAndSubscribe(UPBIT_STREAMS);
}

/**
 * Coinone 실행
 */
function runCoinone(): void {
    console.log("Running Coinone WebSocket client...");
    const coinoneClient = new CoinoneWebSocketClient();
    const coinoneManager = new ExchangeWebSocketManager(coinoneClient);
    coinoneManager.connectAndSubscribe(COINONE_STREAMS);
}

/**
 * 구독 상태 확인 및 재구독 테스트
 */
function testSubscriptionsAndReconnect(): void {
    setTimeout(() => {
        console.log("\nFetching current subscriptions...");

        console.log("Binance subscriptions:");
        const binanceClient = new BinanceWebSocketClient();
        const binanceManager = new ExchangeWebSocketManager(binanceClient);
        binanceManager.listSubscriptions();

        console.log("Binance Futures subscriptions:");
        const binanceFuturesClient = new BinanceFuturesWebSocketClient();
        const binanceFuturesManager = new ExchangeWebSocketManager(
            binanceFuturesClient
        );
        binanceFuturesManager.listSubscriptions();

        console.log("Upbit subscriptions:");
        const upbitClient = new UpbitWebSocketClient();
        const upbitManager = new ExchangeWebSocketManager(upbitClient);
        upbitManager.listSubscriptions();

        console.log("Coinone subscriptions:");
        const coinoneClient = new CoinoneWebSocketClient();
        const coinoneManager = new ExchangeWebSocketManager(coinoneClient);
        coinoneManager.listSubscriptions();

        // 구독 취소 후 재구독
        reconnectSubscriptions(
            binanceManager,
            binanceFuturesManager,
            upbitManager,
            coinoneManager
        );
    }, 5000);
}

/**
 * 구독 취소 후 재구독
 */
function reconnectSubscriptions(
    binanceManager: ExchangeWebSocketManager,
    binanceFuturesManager: ExchangeWebSocketManager,
    upbitManager: ExchangeWebSocketManager,
    coinoneManager: ExchangeWebSocketManager
): void {
    setTimeout(() => {
        console.log("\nUnsubscribing and reconnecting...");

        console.log("Unsubscribing Binance streams...");
        binanceManager.disconnectUunsubscribe(BINANCE_STREAMS);

        console.log("Unsubscribing Binance Futures streams...");
        binanceFuturesManager.disconnectUunsubscribe(BINANCE_FUTURES_STREAMS);

        console.log("Unsubscribing Upbit streams...");
        upbitManager.disconnectUunsubscribe(UPBIT_STREAMS);

        console.log("Unsubscribing Coinone streams...");
        coinoneManager.disconnectUunsubscribe(COINONE_STREAMS);

        console.log("Re-subscribing Binance streams...");
        binanceManager.connectAndSubscribe(BINANCE_STREAMS);

        console.log("Re-subscribing Binance Futures streams...");
        binanceFuturesManager.connectAndSubscribe(BINANCE_FUTURES_STREAMS);

        console.log("Re-subscribing Upbit streams...");
        upbitManager.connectAndSubscribe(UPBIT_STREAMS);

        console.log("Re-subscribing Coinone streams...");
        coinoneManager.connectAndSubscribe(COINONE_STREAMS);
    }, 5000);
}

/**
 * 실행
 */
function main(): void {
    if (RUN_MODE === "single") {
        executeSingleExchange();
    } else if (RUN_MODE === "all") {
        executeAllExchanges();
    } else {
        console.error("Invalid RUN_MODE. Please use 'single' or 'all'.");
    }
}

// 메인 실행
main();
