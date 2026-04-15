import { spawn } from "child_process";
import { existsSync } from "fs";

const builtFile = "dist/index.cjs";
const hasBuild = existsSync(builtFile);

if (!hasBuild) {
  console.error("[start.js] dist/index.cjs not found — run 'npm run build' first");
  process.exit(1);
}

console.log("[start.js] Starting production server...");

const child = spawn("node", [builtFile], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

child.on("error", (err) => {
  console.error("[start.js] Failed to start server:", err.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
