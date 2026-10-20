import { spawn } from "node:child_process";
import { resolve } from "node:path";
import electron from "electron";
import { createServer } from "vite";
const server = await createServer({ plugins: [{ name: "typing-benchmark-runtime", enforce: "pre", resolveId(id) { if (id.endsWith("/app/providers/MatrixProvider")) return resolve("scripts/fixtures/typing-performance-runtime.ts"); } }], server: { port: 0, strictPort: false } });
try {
  await server.listen();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ["scripts/test-typing-performance.cjs", `http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/typing-performance.html`], { env, stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => child.kill(), 60000);
  try { process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); }); }
  finally { clearTimeout(timeout); }
} finally { await server.close(); }
