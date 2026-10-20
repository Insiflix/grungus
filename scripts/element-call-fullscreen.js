// Extend the isolated call document without moving, cloning, or restarting its media streams.
(() => {
  const params = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  const parentOrigin = new URL(params.get("parentUrl")).origin;
  const selector = '[data-testid="videoTile"]';
  const expand = async (tile) => {
    const video = tile.querySelector("video");
    if (!video) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await video.requestFullscreen();
    } catch {
      parent.postMessage({ type: "grungus:media-status", widgetId: params.get("widgetId"), fullscreenError: "Could not open fullscreen. Please try the fullscreen button again." }, parentOrigin);
    }
  };
  const update = () => {
    for (const tile of document.querySelectorAll(selector)) {
      let button = tile.querySelector(":scope > .grungus-tile-fullscreen");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "grungus-tile-fullscreen";
        button.setAttribute("aria-label", "View video fullscreen");
        button.dataset.tooltip = "Fullscreen (or double-click video)";
        button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("click", event => { event.stopPropagation(); void expand(tile); });
        tile.append(button);
      }
      button.hidden = !tile.querySelector("video") || tile.getAttribute("data-video-enabled") === "false";
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-video-enabled"] });
  document.addEventListener("dblclick", event => {
    if (!(event.target instanceof Element) || event.target.closest("button, input, [role='menu']")) return;
    const tile = event.target.closest(selector);
    if (tile?.querySelector("video") && tile.getAttribute("data-video-enabled") !== "false") {
      event.preventDefault(); event.stopPropagation(); void expand(tile);
    }
  }, true);
  update();
})();
