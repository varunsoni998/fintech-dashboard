// Runs on the BusinessOS dashboard: passes a grabbed price to the Price Compare page.
(function () {
  const post = (msg) => window.postMessage({ source: "pc-grab-ext", ...msg }, location.origin);
  const deliver = (grab) => { if (grab && Date.now() - grab.id < 30 * 60 * 1000) post({ type: "PC_GRAB_PRICE", grab }); };

  post({ type: "PC_EXT_READY", version: chrome.runtime.getManifest().version });
  chrome.storage.local.get("pcGrab", (r) => deliver(r.pcGrab));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.pcGrab?.newValue) deliver(ch.pcGrab.newValue); });

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "pc-page") return;
    if (e.data.type === "PC_GRAB_DONE") chrome.storage.local.remove("pcGrab");
    if (e.data.type === "PC_PING") post({ type: "PC_EXT_READY", version: chrome.runtime.getManifest().version });
  });
})();
