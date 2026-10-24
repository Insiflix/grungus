// Console messages are persisted by Electron, including errors before React mounts.
window.addEventListener("error", event => {
  if (event.error instanceof Error) console.error("Unhandled renderer error", event.error.stack ?? event.error.message);
});
window.addEventListener("unhandledrejection", event => {
  console.error("Unhandled renderer rejection", event.reason instanceof Error ? event.reason.stack ?? event.reason.message : event.reason);
});
