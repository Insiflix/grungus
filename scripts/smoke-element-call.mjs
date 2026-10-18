import { spawn } from "node:child_process";
import electron from "electron";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5175", "--strictPort"], { env, stdio: "pipe", windowsHide: true });
let serverError = "";
server.stderr.on("data", data => { serverError += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test Vite server exited: ${serverError}`);
    try { ready = (await fetch("http://127.0.0.1:5175/element-call/config.json")).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  if (!ready) throw new Error("Test Vite server did not start");
  const child = spawn(electron, ["scripts/smoke-element-call.cjs"], { env, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  process.exitCode = code ?? 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { server.kill(); }
