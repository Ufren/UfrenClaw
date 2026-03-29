import WebSocket from "ws";
import { PROTOCOL_VERSION } from "./packages/main/src/modules/gateway/protocol/types";

// Polyfill process.stdout.clearLine for non-TTY environments if needed, though usually not an issue in tests
// For now, assume we run in a normal terminal.

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGateway() {
    console.log("🚀 Starting Gateway E2E Test...");
    
    // Connect to local gateway
    const ws = new WebSocket("ws://localhost:53000");
    
    let connected = false;
    let handshakeComplete = false;
    let runId: string | undefined;

    ws.on("open", () => {
        console.log("✅ WebSocket connected");
        connected = true;
    });

    ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        // console.log("Received:", JSON.stringify(msg, null, 2));

        if (msg.type === "event" && msg.event === "connect.challenge") {
            console.log("Received challenge, sending connect frame...");
            const connectFrame = {
                type: "connect",
                minProtocol: 1,
                maxProtocol: 1,
                client: {
                    id: "test-client",
                    mode: "cli",
                    version: "0.1.0",
                    platform: "test",
                    deviceFamily: "test"
                },
                auth: {
                    token: "test-token" 
                },
                nonce: msg.payload.nonce
            };
            ws.send(JSON.stringify(connectFrame));
        } 
        else if (msg.type === "event" && msg.event === "hello-ok") {
            console.log("✅ Handshake successful!");
            handshakeComplete = true;

            // Test 1: System Presence
            const presenceReq = {
                type: "req",
                id: "req-1",
                method: "system.presence",
                params: {}
            };
            console.log("Testing system.presence...");
            ws.send(JSON.stringify(presenceReq));
        }
        else if (msg.type === "res" && msg.id === "req-1") {
            console.log("✅ system.presence response:", msg.payload);
            
            // Test 2: Agent Run (Mock)
            const runReq = {
                type: "req",
                id: "req-2",
                method: "agent.run",
                params: {
                    model: "mock-model",
                    prompt: "Hello from test script!",
                    stream: true
                }
            };
            console.log("Testing agent.run...");
            ws.send(JSON.stringify(runReq));
        }
        else if (msg.type === "res" && msg.id === "req-2") {
            if (msg.ok) {
                console.log("✅ agent.run accepted, runId:", msg.payload.runId);
                runId = msg.payload.runId;
            } else {
                console.error("❌ agent.run failed:", msg.error);
                process.exit(1);
            }
        }
        else if (msg.type === "event" && msg.event === "agent.output") {
            if (msg.payload.runId === runId) {
                if (msg.payload.delta) {
                    process.stdout.write(msg.payload.delta);
                }
                if (msg.payload.done) {
                    console.log("\n✅ Agent run completed!");
                    ws.close();
                    process.exit(0);
                }
            }
        }
    });

    ws.on("error", (err) => {
        console.error("❌ Client error:", err);
        process.exit(1);
    });

    // Wait for connection
    await delay(5000);
    if (!connected) {
        console.error("❌ Failed to connect to Gateway (timeout)");
        process.exit(1);
    }
}

testGateway().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
