import { spawn } from "node:child_process";
import electron from "electron";
import { createServer } from "vite";

const server = await createServer({ server: { port: 0, strictPort: false } });
try {
  await server.listen();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ["scripts/test-chat-interactions.cjs", `http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/chat-interactions.html`], { env, stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => child.kill(), 60_000);
  try {
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
  } finally { clearTimeout(timeout); }
} finally { await server.close(); }
