import { watch } from "node:fs";
import { spawn } from "node:child_process";
import electronPath from "electron";

// Some editor/agent hosts set this for their own Electron helpers. A desktop
// application must launch Electron in browser-process mode instead.
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

let child;
let stopping = false;
let restarting = false;
let restartTimer;
const launch = () => {
  child = spawn(electronPath, ["."], { cwd: process.cwd(), env: environment, stdio: "inherit", windowsHide: false });
  child.on("error", error => { console.error("Unable to launch Electron", error); stopping = true; process.exitCode = 1; watcher?.close(); });
  child.on("exit", code => {
    if (restarting && !stopping) { restarting = false; launch(); }
    else { watcher?.close(); process.exit(code ?? 0); }
  });
};
const watcher = environment.VITE_DEV_SERVER_URL ? watch("dist-electron", { recursive: true }, (_event, filename) => {
  if (!filename || !/\.(?:js|cjs)$/.test(filename) || stopping) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (stopping || restarting) return;
    restarting = true;
    console.log("Electron code changed; restarting desktop process...");
    child?.kill();
  }, 500);
}) : null;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  stopping = true; clearTimeout(restartTimer); watcher?.close(); child?.kill(signal);
});
launch();
