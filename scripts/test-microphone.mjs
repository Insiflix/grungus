import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
const server = await createServer({ optimizeDeps: { include: ["@matrix-org/matrix-sdk-crypto-wasm"] }, server: { port: 0, strictPort: false } });
try {
  await server.listen();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ["scripts/test-microphone.cjs", `http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/microphone-smoke.html`], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally { await server.close(); }
