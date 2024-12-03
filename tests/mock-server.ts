// mock-server.ts
import WebSocket, { WebSocketServer } from "ws";

interface Subscription {
    client: WebSocket;
    symbol: string;
}

class MockBinanceWebSocketServer {
    private wss: WebSocketServer;
    private subscriptions: Subscription[] = [];

    constructor(port: number) {
        this.wss = new WebSocketServer({ port });

        this.wss.on("connection", (ws) => {
            console.log("Client connected");

            ws.on("message", (message) => {
                this.handleMessage(ws, message.toString());
            });

            ws.on("close", () => {
                this.handleDisconnection(ws);
            });
        });

        console.log(
            `Mock Binance WebSocket Server running on ws://localhost:${port}`
        );
    }

    private handleMessage(ws: WebSocket, message: string) {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.method === "SUBSCRIBE") {
                this.handleSubscription(ws, parsedMessage.params);
            } else if (parsedMessage.method === "UNSUBSCRIBE") {
                this.handleUnsubscription(ws, parsedMessage.params);
            } else {
                ws.send(JSON.stringify({ error: "Unknown method" }));
            }
        } catch (error) {
            ws.send(JSON.stringify({ error: "Invalid JSON" }));
        }
    }

    private handleSubscription(ws: WebSocket, symbols: string[]) {
        symbols.forEach((symbol) => {
            this.subscriptions.push({ client: ws, symbol });
            console.log(`Subscribed to ${symbol}`);
        });

        ws.send(
            JSON.stringify({
                result: "Subscribed successfully",
                symbols,
            })
        );

        // Start sending mock data
        this.startSendingData(ws, symbols);
    }

    private handleUnsubscription(ws: WebSocket, symbols: string[]) {
        this.subscriptions = this.subscriptions.filter(
            (sub) => sub.client !== ws || !symbols.includes(sub.symbol)
        );
        console.log(`Unsubscribed from ${symbols.join(", ")}`);
        ws.send(
            JSON.stringify({
                result: "Unsubscribed successfully",
                symbols,
            })
        );
    }

    private handleDisconnection(ws: WebSocket) {
        this.subscriptions = this.subscriptions.filter(
            (sub) => sub.client !== ws
        );
        console.log("Client disconnected");
    }

    private startSendingData(ws: WebSocket, symbols: string[]) {
        setInterval(() => {
            symbols.forEach((symbol) => {
                const data = {
                    u: Date.now(),
                    s: symbol,
                    b: (Math.random() * 10000).toFixed(2), // Mock bid price
                    B: (Math.random() * 10).toFixed(3), // Mock bid quantity
                    a: (Math.random() * 10000).toFixed(2), // Mock ask price
                    A: (Math.random() * 10).toFixed(3), // Mock ask quantity
                };
                ws.send(JSON.stringify(data));
            });
        }, 1000);
    }
}

// Start the Mock Server
new MockBinanceWebSocketServer(8080);
