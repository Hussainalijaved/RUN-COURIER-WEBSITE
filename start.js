import { spawn, execSync } from "child_process";
import { existsSync } from "fs";

const BUILT = "dist/index.cjs";

// If the compiled server doesn't exist yet, build it first
if (!existsSync(BUILT)) {
  console.log("[start] dist/index.cjs not found — building now...");
  try {
    execSync("npm run build", { stdio: "inherit" });
    console.log("[start] Build complete.");
  } catch (err) {
    console.error("[start] Build failed:", err.message);
    process.exit(1);
  }
} else {
  console.log("[start] dist/index.cjs found, skipping build.");
}

console.log("[start] Launching production server...");

const server = spawn("node", [BUILT], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

server.on("error", (err) => {
  console.error("[start] Server failed to start:", err.message);
  process.exit(1);
});

server.on("exit", (code) => {
  console.log("[start] Server exited with code:", code);
  process.exit(code ?? 0);
});
