/** Gate widget-api's transport, whose built-in strict mode only accepts the host's own origin. */
export function guardWidgetMessages(iframe: HTMLIFrameElement, widgetId: string, widgetUrl: string): () => void {
  const origin = new URL(widgetUrl).origin;
  const guard = (event: MessageEvent) => {
    if (event.data?.widgetId === widgetId && (event.origin !== origin || event.source !== iframe.contentWindow)) event.stopImmediatePropagation();
  };
  window.addEventListener("message", guard, true);
  return () => window.removeEventListener("message", guard, true);
}
