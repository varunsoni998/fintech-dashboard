// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open them in a small VISIBLE "price checker" window
// (Chrome pauses hidden tabs, and sites like Expedia only draw their prices when the page is on screen),
// read the final total for the stay, close the tab and send the price back. The window closes by itself.

const ALLOWED = /(^|\.)(booking\.com|expedia\.co\.in|expedia\.com|hotels\.com|makemytrip\.com|agoda\.com)$/i;
const WINDOWS = 2;                 // checker windows side by side (each reads one site at a time)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Runs inside the hotel's page on the booking site. Must be self-contained.
// Built from the real page layouts (Oct 2026):
//  • Booking.com hotel page: room table #hprt-table, each row "₹ 27,000 … +₹ 4,860 taxes and charges … Guests: 2 adults"
//    (the same table also lists cheaper 1-adult prices → only rows for our number of adults count)
//  • Booking.com checkout (secure.booking.com/book.html): "Price ₹ 36,029.60  +₹ 6,485.33 taxes and charges"
//  • Expedia / Hotels.com hotel page: "Choose your room" section, each room "View all photos for <room> … ₹146,910 total"
//    (further down the page shows OTHER hotels' totals → only the "Choose your room" section counts)
//  • Expedia search page (Google sometimes links here): find THIS hotel's card and open its page
async function readSitePrice(site, nights, adults, hotelName) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const R = "(?:₹|Rs\\.?|INR)\\s?";
  const AMT = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  const rx = (s) => new RegExp(s, "gi");
  const clean = (s) => (s || "").replace(/[   ]/g, " ");
  const words = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["hotel", "the", "and", "resort", "by", "mumbai", "dubai"].includes(w));
  const overlap = (a, b) => { const A = words(a), B = new Set(words(b)); return A.length ? A.filter(w => B.has(w)).length / A.length : 0; };
  adults = adults || 2;
  const cheapest = (list) => list.filter(x => x.total > 100).sort((a, b) => a.total - b.total)[0];
  let snippet = "";

  for (let t = 0; t < 30; t++) {
    const txt = clean(document.body?.innerText || "");
    if (/captcha|are you a robot|verify you are human|access denied|press (and|&) hold/i.test(txt) && txt.length < 4000)
      return { error: "The site asked for a security check — open it once in Chrome, then re-check", debug: txt.slice(0, 300) };

    if (site === "Expedia" || site === "Hotels.com") {
      if (/Hotel-Search/i.test(location.pathname)) {
        // list of hotels → open THIS hotel's own page
        let best = null, bs = 0;
        for (const a of document.querySelectorAll('a[href*="Hotel-Information"]')) {
          const card = a.closest("[data-stid*='lodging-card'], li, article, [data-stid='property-listing']") || a;
          const label = (a.getAttribute("aria-label") || "") + " " + (card.innerText || "").slice(0, 160);
          const s2 = overlap(hotelName, label);
          if (s2 > bs) { bs = s2; best = a; }
        }
        if (best && bs >= 0.5) return { go: best.href };
        if (t > 10) return { error: "The site showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
      } else {
        const start = txt.search(/Choose your room|Select a room|Room options/i);
        if (start >= 0) {
          const rest = txt.slice(start + 15);
          const stop = rest.search(/\n(Similar properties|Explore similar|Compare similar|You may also like|Popular properties|Properties nearby|Nearby properties|About this property|About the property|Policies|Important information|Guest reviews|Reviews\n|Explore the area|Accessibility)/i);
          const sec = txt.slice(start, start + 15 + (stop >= 0 ? stop : rest.length));
          const found = [];
          for (const b of sec.split(/View all photos for /i).slice(1)) {
            const room = b.split("\n")[0].trim();
            const mm = [...b.matchAll(rx(R + AMT + "\\s*total\\b"))];
            if (mm.length) found.push({ total: num(mm[0][1]), room, free: /Fully refundable|Free cancellation/i.test(b) });
          }
          if (!found.length) for (const mm of sec.matchAll(rx(R + AMT + "\\s*total\\b"))) found.push({ total: num(mm[1]), room: "" });
          const c = cheapest(found);
          if (c) return { total: Math.round(c.total), room: c.room, free: !!c.free, options: found.length, url: location.href };
        }
      }
    } else if (site === "Booking.com") {
      const rows = [...document.querySelectorAll("#hprt-table tbody tr, table.hprt-table tbody tr")];
      if (rows.length) {
        let room = ""; const found = [];
        for (const r of rows) {
          const rn = r.querySelector(".hprt-roomtype-link, .hprt-roomtype-icon-link, [data-room-name]");
          if (rn) room = clean(rn.getAttribute("data-room-name") || rn.innerText).trim().split("\n")[0];
          const rt = clean(r.innerText);
          const p = [...rt.matchAll(rx(R + AMT + "[^₹]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];
          const inc = !p && [...rt.matchAll(rx(R + AMT + "[^₹]{0,40}?includes taxes and (?:charges|fees)"))][0];
          const total = p ? num(p[1]) + num(p[2]) : inc ? num(inc[1]) : 0;
          if (!total) continue;
          const g = rt.match(/Guests?:\s*(\d+)\s*adult/i) || rt.match(/Max(?:imum)? (?:people|persons|guests):?\s*(\d+)/i);
          const cap = g ? +g[1] : (r.querySelectorAll(".bicon-occupancy, .c-occupancy-icons__adults i, [class*='occupancy'] svg").length || null);
          if (cap !== null && cap < adults) continue;          // e.g. a 1-adult price when we need 2
          found.push({ total, room, free: /Free cancellation/i.test(rt) });
        }
        const c = cheapest(found);
        if (c) return { total: Math.round(c.total), room: c.room, free: c.free, options: found.length, url: location.href };
      }
      // checkout page: "Price ₹ 36,029.60  +₹ 6,485.33 taxes and charges"
      const p = [...txt.matchAll(rx("\\bPrice\\s*" + R + AMT + "[^₹]{0,30}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];
      if (p) { const rm = txt.match(/\n\s*1\s*x\s*([^\n]+)/i); return { total: Math.round(num(p[1]) + num(p[2])), room: rm ? rm[1].trim() : "", url: location.href }; }
    } else if (site === "MakeMyTrip") {
      // "₹ 4,999  + ₹ 600 taxes & fees  Per Night"
      const per = [...txt.matchAll(rx(R + AMT + "\\s*\\+\\s*" + R + AMT + "\\s*taxes\\s*(?:&|and)\\s*fees"))].map(m => (num(m[1]) + num(m[2])) * (nights || 1));
      if (per.length) return { total: Math.round(Math.min(...per)), url: location.href };
    } else {
      return { error: "Not read automatically for this site" };
    }

    const k = txt.search(/₹|Rs\.?\s?\d/);
    snippet = k >= 0 ? txt.slice(Math.max(0, k - 120), k + 380) : txt.slice(0, 400);
    // bring the rooms into view (not to the bottom of the page)
    const el = [...document.querySelectorAll("#hprt-table, #availability_target, [data-stid='section-room-list'], h2, h3")].find(e => e.id === "hprt-table" || e.id === "availability_target" || /choose your room|select a room|availability/i.test(e.textContent || ""));
    if (el) el.scrollIntoView({ block: "start" }); else if (t < 6) window.scrollBy(0, 700);
    await sleep(1000);
  }
  return { error: "Couldn't find the price on the page", debug: snippet.replace(/\s+/g, " ").slice(0, 500) };
}

async function waitForSite(tabId, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) throw new Error("Tab closed");
    let host = "";
    try { host = new URL(t.url || t.pendingUrl || "").hostname; } catch { /* still redirecting */ }
    if (t.status === "complete" && ALLOWED.test(host)) return;
    await sleep(500);
  }
  throw new Error("The site took too long to open");
}

async function checkOne(job, windowId) {
  const tab = await chrome.tabs.create({ url: job.url, active: true, windowId });
  try {
    for (let hop = 0; hop < 3; hop++) {
      await waitForSite(tab.id, 45000);
      await sleep(2000);
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSitePrice, args: [job.source, job.nights, job.adults || 2, job.hotel || ""] });
      const r = res?.result;
      if (r?.go) { await chrome.tabs.update(tab.id, { url: r.go }); await sleep(1500); continue; }   // list page → this hotel's page
      return r || { error: "Couldn't read the page" };
    }
    return { error: "The site kept redirecting" };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function logResult(job, result) {
  const { pcLog = [] } = await chrome.storage.local.get("pcLog");
  pcLog.unshift({ at: Date.now(), site: job.source, url: job.url, ...result });
  await chrome.storage.local.set({ pcLog: pcLog.slice(0, 30) });
}

let running = false;
const pending = [];

async function run(jobs, replyTabId) {
  // skip a hotel+site that is already waiting in the queue
  const k = (j) => `${j.hid}|${j.source}|${j.url}`;
  const queued = new Set(pending.map(x => k(x.j)));
  pending.push(...jobs.filter(j => !queued.has(k(j)) && queued.add(k(j))).map(j => ({ j, replyTabId })));
  if (running) return;
  running = true;
  const send = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  const replyTabs = new Set();
  // small checker windows, side by side at the top-left of the screen
  const wins = [];
  const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);
  for (let i = 0; i < Math.min(WINDOWS, pending.length); i++) {
    const w = await withTimeout(chrome.windows.create({ url: "about:blank", focused: i === 0, type: "normal", width: 520, height: 720, left: 20 + i * 530, top: 20 }).catch(() => null), 5000);
    if (w) wins.push(w); else break;
  }
  if (!wins.length) {                     // couldn't open a window → use a tab in the current window
    const t = await chrome.tabs.get(replyTabId).catch(() => null);
    if (t) wins.push({ id: t.windowId, shared: true });
  }
  const worker = async (w) => {
    for (let item = pending.shift(); item; item = pending.shift()) {
      const { j, replyTabId: rt } = item; replyTabs.add(rt);
      send(rt, { type: "PC_CHECK_STARTED", job: j });
      let result;
      try { result = await checkOne(j, w.id); } catch (e) { result = { error: String(e.message || e) }; }
      logResult(j, result);
      send(rt, { type: "PC_CHECK_RESULT", job: j, result });
    }
  };
  try { await Promise.all(wins.map(worker)); }
  finally {
    for (const w of wins) if (!w.shared) chrome.windows.remove(w.id).catch(() => {});
    running = false;
    for (const rt of replyTabs) {
      send(rt, { type: "PC_CHECK_DONE" });
      chrome.tabs.get(rt).then(t => { chrome.windows.update(t.windowId, { focused: true }); chrome.tabs.update(rt, { active: true }); }).catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PC_CHECK" && Array.isArray(msg.jobs) && sender.tab?.id) {
    const jobs = msg.jobs.filter(j => j && /^https:\/\//.test(j.url || "")).slice(0, 40);
    run(jobs, sender.tab.id);
    sendResponse({ ok: true, count: jobs.length });
  }
});
