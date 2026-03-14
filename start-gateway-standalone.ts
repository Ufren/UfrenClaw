import { GatewayServer } from "./packages/main/src/modules/gateway/core/GatewayServer";

async function main() {
    console.log("Starting Gateway Server (Standalone Mode)...");
    
    // Mock Electron app if needed by other modules (though we patched ConfigManager/PluginLoader)
    // global.app = { getPath: () => "." }; 

    const server = new GatewayServer();
    await server.start();
    console.log("Gateway Server started on port 53000");
}

main().catch(err => {
    console.error("Failed to start gateway:", err);
    process.exit(1);
});
