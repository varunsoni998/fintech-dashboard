// Runs on the BusinessOS dashboard: connects the Price Compare page with the extension.
(function () {
  const version = chrome.runtime.getManifest().version;
  const post = (msg) => window.postMessage({ source: "pc-grab-ext", ...msg }, location.origin);
  const deliver = (grab) => { if (grab && Date.now() - grab.id < 30 * 60 * 1000) post({ type: "PC_GRAB_PRICE", grab }); };

  post({ type: "PC_EXT_READY", version, auto: true });
  chrome.storage.local.get("pcGrab", (r) => deliver(r.pcGrab));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.pcGrab?.newValue) deliver(ch.pcGrab.newValue); });

  // results of automatic checks → page
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && /^PC_CHECK_/.test(msg.type)) post(msg);
  });

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "pc-page") return;
    if (e.data.type === "PC_GRAB_DONE") chrome.storage.local.remove("pcGrab");
    if (e.data.type === "PC_PING") post({ type: "PC_EXT_READY", version, auto: true });
    if (e.data.type === "PC_CHECK") {
      // after the extension is updated/reloaded, this old copy can't reach it any more → tell the page to press F5
      let alive = false; try { alive = !!chrome.runtime?.id; } catch { alive = false; }
      if (!alive) { post({ type: "PC_EXT_STALE" }); return; }
      try {
        chrome.runtime.sendMessage({ type: "PC_CHECK", jobs: e.data.jobs }, (r) => {
          if (chrome.runtime.lastError || !r) post({ type: "PC_EXT_STALE", error: chrome.runtime.lastError?.message });
          else post({ type: "PC_CHECK_QUEUED", count: r.count || 0 });
        });
      } catch { post({ type: "PC_EXT_STALE" }); }
    }
  });
})();
