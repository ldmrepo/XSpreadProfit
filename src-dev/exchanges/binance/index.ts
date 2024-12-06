/**
 * Path: src/exchanges/binance/index.ts
 * 바이낸스 모듈 진입점
 */
export * from "./BinanceCollector"
export * from "./BinanceConnector"
export * from "./types"
export * from "./config"

/**
* 사용 예시:
* 
const startBinanceCollection = async () => {
   const collector = new BinanceCollector();
   
   try {
       await collector.start([
           "BTCUSDT",
           "ETHUSDT",
           "BNBUSDT"
       ]);

       collector.on("error", (error) => {
           console.error("Binance collection error:", error);
       });

   } catch (error) {
       console.error("Failed to start Binance collector:", error);
   }
};
*/
