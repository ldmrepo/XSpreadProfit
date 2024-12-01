export interface standardData {
    exchange: string; // 거래소 이름
    symbol: string; // 심볼, 예: BTC/USDT
    exchangeType: string; // 선물, 현물
    ticker: string; // 거래소 심볼, 예: BTCUSDT
    timestamp: string; // 타임스탬프, 밀리초 단위
    bids: [number, number][]; // 매수 호가 리스트 [가격, 수량]
    asks: [number, number][]; // 매도 호가 리스트 [가격, 수량]
}
