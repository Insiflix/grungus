// Embedded call controls use the same custom tooltip treatment as the host app.
(() => {
  let timer, target, tooltip;
  const hide = () => { clearTimeout(timer); tooltip?.remove(); tooltip = undefined; target = undefined; };
  const migrate = root => {
    const elements = root instanceof Element ? [root, ...root.querySelectorAll("[title]")] : root.querySelectorAll("[title]");
    for (const element of elements) {
      if (!(element instanceof HTMLElement) || element instanceof HTMLIFrameElement || !element.hasAttribute("title")) continue;
      const text = element.getAttribute("title"); element.removeAttribute("title");
      if (text) element.dataset.tooltip = text;
    }
  };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") migrate(record.target);
      else for (const node of record.addedNodes) if (node instanceof Element) migrate(node);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["title"]});
  migrate(document);
  const show = event => {
    const next = event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
    if (next === target) return;
    hide(); if (!next?.dataset.tooltip) return; target = next;
    timer = setTimeout(() => {
      if (!next.isConnected) return;
      tooltip = document.createElement("div"); tooltip.className = "grungus-call-tooltip"; tooltip.popover = "manual";
      tooltip.setAttribute("role","tooltip"); tooltip.textContent = next.dataset.tooltip;
      document.body.append(tooltip); tooltip.showPopover();
      const rect = next.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8,Math.min(rect.left+(rect.width-box.width)/2,innerWidth-box.width-8))}px`;
      tooltip.style.top = `${rect.bottom+box.height+12 < innerHeight ? rect.bottom+8 : Math.max(8,rect.top-box.height-8)}px`;
    },event.type === "focusin" ? 0 : 450);
  };
  document.addEventListener("pointerover",show); document.addEventListener("focusin",show);
  document.addEventListener("pointerout",event => { if (!target?.contains(event.relatedTarget)) hide(); });
  document.addEventListener("focusout",hide); document.addEventListener("pointerdown",hide);
  document.addEventListener("keydown",event => {if(event.key === "Escape") hide();});
  window.addEventListener("blur",hide); window.addEventListener("scroll",hide,true);
})();
