import { spawn } from "node:child_process";
import electron from "electron";
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["scripts/test-packaged-security.cjs"], { env, stdio: "inherit", windowsHide: true });
const timer = setTimeout(() => child.kill(), 45_000);
try { process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); }); }
finally { clearTimeout(timer); }
