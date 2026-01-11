// Production Safe Mode - Minimal server that cannot crash
console.log("🚀 PRODUCTION SAFE MODE - Starting...");

const express = require ? require("express") : null;

// Use dynamic import for ESM compatibility
async function startServer() {
  const express = (await import("express")).default;
  
  const app = express();
  const PORT = Number(process.env.PORT) || 5000;

  console.log(`[PROD] Using port: ${PORT}`);

  // Health check - critical for Replit
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", mode: "safe", timestamp: new Date().toISOString() });
  });

  // Serve static fallback for ALL routes
  app.get("*", (req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Run Courier - UK Delivery Services</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              color: white;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 { 
              font-size: 3rem; 
              margin-bottom: 1rem;
              background: linear-gradient(90deg, #00d9ff, #00ff88);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p { 
              font-size: 1.25rem; 
              opacity: 0.9;
              margin-bottom: 2rem;
            }
            .status {
              display: inline-block;
              background: rgba(0, 255, 136, 0.2);
              border: 1px solid rgba(0, 255, 136, 0.5);
              padding: 0.5rem 1.5rem;
              border-radius: 2rem;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Run Courier</h1>
            <p>UK's Premier Delivery Service</p>
            <div class="status">Server Online</div>
          </div>
        </body>
      </html>
    `);
  });

  // Start server - NO async code before this
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PROD] Server listening on 0.0.0.0:${PORT}`);
    console.log("[PROD] Production Safe Mode ACTIVE");
    console.log("[PROD] Disabled: Stripe, Supabase, WebSocket, Vite, Background Jobs");
  });
}

startServer().catch(err => {
  console.error("[PROD] Fatal error:", err);
  process.exit(1);
});
