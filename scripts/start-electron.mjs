import { spawn } from "node:child_process";
import electronPath from "electron";

// Some editor/agent hosts set this for their own Electron helpers. A desktop
// application must launch Electron in browser-process mode instead.
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Unable to launch Electron", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
