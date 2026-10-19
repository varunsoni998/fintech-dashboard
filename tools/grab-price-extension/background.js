// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open them in a small VISIBLE "price checker" window
// (Chrome pauses hidden tabs, and sites like Expedia only draw their prices when the page is on screen),
// read the final total for the stay, close the tab and send the price back. The window closes by itself.

const ALLOWED = /(^|\.)(booking\.com|expedia\.co\.in|expedia\.com|hotels\.com|makemytrip\.com|agoda\.com)$/i;
const WINDOWS = 1;                 // one checker window, one site at a time (looks less like a robot to the sites)
// Hotels.com shows a "Bot or Not?" robot test to automatic visits → not checked automatically (same rooms as Expedia).
// Expedia does the same ("Bot or Not?"), so neither is opened automatically – repeated tries could get your
// office internet flagged. Check them by hand: View deal → booking step → ₹ icon.
// When a robot test appears, the checker window comes to the front and waits for YOU to complete it
// (the extension never answers it itself), then reads the price.
const SKIP = {};
const ROBOT_WAIT = 3 * 60 * 1000;
const isRobotPage = () => /captcha|are you a robot|bot or not|robot or human|are you human|verify you are human|unusual traffic|press (and|&) hold/i
  .test(document.title + " " + (document.body?.innerText || "").slice(0, 6000)) && (document.body?.innerText || "").length < 6000;
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
  // which currency is the page in? (the token most often written right before a number)
  const pageCurrency = () => {
    const norm = { "₹": "INR", "RS": "INR", "RS.": "INR", "INR": "INR", "US$": "USD", "USD": "USD", "$": "USD", "A$": "AUD", "AUD": "AUD", "S$": "SGD", "SGD": "SGD",
      "AED": "AED", "€": "EUR", "EUR": "EUR", "£": "GBP", "GBP": "GBP", "฿": "THB", "THB": "THB" };
    const counts = {};
    for (const m of (document.body?.innerText || "").matchAll(/(₹|Rs\.?|INR|US\$|USD|A\$|AUD|S\$|SGD|AED|€|EUR|£|GBP|฿|THB|\$)\s?\d/g)) {
      const c = norm[m[1].toUpperCase()] || "INR"; counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "INR";
  };
  const core = async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const R = "(?:₹|Rs\\.?|INR|US\\$|USD|A\\$|AUD|S\\$|SGD|AED|€|EUR|£|GBP|฿|THB|\\$)\\s?";   // any currency; converted to ₹ in Price Compare
  const AMT = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  const rx = (s) => new RegExp(s, "gi");
  const clean = (s) => (s || "").replace(/[   ]/g, " ");
  const STOP = ["hotel", "hotels", "the", "and", "resort", "by", "a", "an", "of", "at", "in"];
  const words = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.includes(w));
  const overlap = (a, b) => {
    const A = words(a), B = new Set(words(b));
    if (!A.length) return clean(b).toLowerCase().includes(clean(a).toLowerCase().trim()) ? 1 : 0;
    return A.filter(w => B.has(w)).length / A.length;
  };
  adults = adults || 2;
  const cheapest = (list) => list.filter(x => x.total > 100).sort((a, b) => a.total - b.total)[0];
  let snippet = "";

  for (let t = 0; t < 30; t++) {
    const txt = clean(document.body?.innerText || "");
    if (/captcha|are you a robot|bot or not|robot or human|are you human|verify you are human|unusual traffic|access denied|press (and|&) hold/i.test(document.title + " " + txt) && txt.length < 6000)
      return { robot: true, debug: txt.slice(0, 300) };

    if (site === "Expedia" || site === "Hotels.com") {
      const HOTEL_LINK = 'a[href*="Hotel-Information"], a[href*="/ho"]';
      const isHotelLink = (a) => /Hotel-Information|\/ho\d+/i.test(a.getAttribute("href") || "");
      if (/Hotel-Search|search\.do|\/search/i.test(location.pathname)) {
        // 1) the hotel Google linked to is pinned at the top under "Continue with your booking" → its total is right there
        const pinAt = txt.search(/Continue with your booking/i);
        if (pinAt >= 0) {
          const card = txt.slice(pinAt, pinAt + 900);
          const mm = [...card.matchAll(rx(R + AMT + "\\s*total\\b"))][0];
          if (mm) return { total: Math.round(num(mm[1])), room: "", url: location.href, note: "price from the pinned card at the top" };
        }
        // list of hotels → open THIS hotel's own page.
        // The hotel Google linked to is pinned at the top under "Continue with your booking".
        const links = [...document.querySelectorAll(HOTEL_LINK)].filter(isHotelLink);
        const pin = [...document.querySelectorAll("h2,h3,div,span")].find(e => /^continue with your booking/i.test((e.innerText || "").trim()) && (e.innerText || "").length < 60);
        if (pin) {
          const after = links.find(a => pin.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (after) return { go: after.href };
        }
        let best = null, bs = 0;
        for (const a of links) {
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
          const p = [...rt.matchAll(rx(R + AMT + "[^₹$€£]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];
          const inc = !p && [...rt.matchAll(rx(R + AMT + "[^₹$€£]{0,40}?includes taxes and (?:charges|fees)"))][0];
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
      // the room Google linked to is often shown at the top: "₹ 55,151 … Includes taxes and charges" / "+₹ X taxes and charges"
      const top = [...txt.matchAll(rx(R + AMT + "[^₹$€£]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0]
        || [...txt.matchAll(rx(R + AMT + "[^₹$€£]{0,40}?includes taxes and (?:charges|fees)"))][0];
      if (top && t >= 3) return { total: Math.round(num(top[1]) + (top[2] ? num(top[2]) : 0)), room: "", url: location.href, note: "price shown at the top of the page" };
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
    // bring the rooms into view: the room list often loads only when you scroll to it or click the "Rooms" tab
    const el = [...document.querySelectorAll("#hprt-table, #availability_target, #Offers, [data-stid='section-room-list'], h2, h3")]
      .find(e => ["hprt-table", "availability_target", "Offers"].includes(e.id) || /choose your room|select a room|availability/i.test((e.textContent || "").slice(0, 60)));
    if (el) el.scrollIntoView({ block: "start" });
    else {
      if (t === 1 || t === 8) {                                    // the page's own "Rooms" tab (just moves down the page)
        const tab = [...document.querySelectorAll("a,button,[role='tab']")].find(e => /^rooms$/i.test((e.innerText || "").trim()));
        if (tab) tab.click();
      }
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      if (atBottom) window.scrollTo(0, 0); else window.scrollBy(0, 900);
    }
    await sleep(1000);
  }
  return { error: "Couldn't find the price on the page", debug: snippet.replace(/\s+/g, " ").slice(0, 500) };
  };
  const r = await core();
  if (r && r.total) r.currency = pageCurrency();
  return r;
}

async function waitForSite(tabId, ms) {
  // Ready when the tab is on the booking site AND (finished loading OR has been there 6 s).
  // Some sites (Expedia) never report "finished" because adverts keep loading.
  const end = Date.now() + ms;
  let onSiteSince = 0, host = "";
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) throw new Error("Tab closed");
    try { host = new URL(t.url || t.pendingUrl || "").hostname; } catch { host = ""; }
    if (ALLOWED.test(host)) {
      if (!onSiteSince) onSiteSince = Date.now();
      if (t.status === "complete" || Date.now() - onSiteSince > 6000) return;
    } else onSiteSince = 0;
    await sleep(500);
  }
  throw new Error(host ? `The site took too long to open (${host})` : "The link didn't open a booking site");
}

// Robot test on screen: bring the window to the front, notify, and wait until the person has completed it.
async function waitForPerson(tabId, windowId, job) {
  await chrome.windows.update(windowId, { focused: true, width: 1000, height: 820, state: "normal" }).catch(() => {});
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  chrome.notifications?.create("pc-robot-" + Date.now(), {
    type: "basic", iconUrl: "icon128.png", priority: 2, requireInteraction: false,
    title: `${job.source} needs you`,
    message: `Please complete the "${job.source}" robot check in the price-checker window. The price will be read automatically after that.`,
  });
  const end = Date.now() + ROBOT_WAIT;
  while (Date.now() < end) {
    await sleep(2000);
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return false;                                         // window/tab closed by the person
    if (t.status !== "complete") continue;
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: isRobotPage });
      if (res && res.result === false) { await sleep(2500); return true; }
    } catch { /* page is changing after the test */ }
  }
  return false;
}

async function checkOne(job, windowId) {
  if (SKIP[job.source]) return { error: SKIP[job.source] };
  const tab = await chrome.tabs.create({ url: job.url, active: true, windowId });
  try {
    let robotDone = false;
    for (let hop = 0; hop < 5; hop++) {
      await waitForSite(tab.id, 45000);
      await sleep(2000);
      let r;
      try {
        const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSitePrice, args: [job.source, job.nights, job.adults || 2, job.hotel || ""] });
        r = res?.result;
      } catch (e) { await sleep(2000); continue; }             // the page changed while reading → try again
      if (r?.go) { await chrome.tabs.update(tab.id, { url: r.go }); await sleep(1500); continue; }   // list page → this hotel's page
      if (r?.robot) {
        if (robotDone) return { error: "The robot test came back — use View deal", debug: r.debug };
        const ok = await waitForPerson(tab.id, windowId, job);
        if (!ok) return { error: "Robot test not completed — use View deal", debug: r.debug };
        robotDone = true;
        continue;                                                // test gone → read the price
      }
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

let running = false, runStartedAt = 0;
const pending = [];

async function run(jobs, replyTabId) {
  // skip a hotel+site that is already waiting in the queue
  const k = (j) => `${j.hid}|${j.source}|${j.url}`;
  const queued = new Set(pending.map(x => k(x.j)));
  pending.push(...jobs.filter(j => !queued.has(k(j)) && queued.add(k(j))).map(j => ({ j, replyTabId })));
  const send = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  for (let i = pending.length - 1; i >= 0; i--) {
    const { j, replyTabId: rt } = pending[i];
    if (SKIP[j.source]) { pending.splice(i, 1); send(rt, { type: "PC_CHECK_RESULT", job: j, result: { error: SKIP[j.source] } }); }
  }
  if (!pending.length) { if (!running) send(replyTabId, { type: "PC_CHECK_DONE" }); return; }
  if (running && Date.now() - runStartedAt < 10 * 60 * 1000) return;   // a check is already going (reset if stuck >10 min)
  running = true; runStartedAt = Date.now();
  const replyTabs = new Set();
  // small checker windows, side by side at the top-left of the screen
  const wins = [];
  const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);
  for (let i = 0; i < Math.min(WINDOWS, pending.length); i++) {
    const w = await withTimeout(chrome.windows.create({ url: "about:blank", focused: i === 0, type: "normal", width: 1100, height: 800, left: 20 + i * 40, top: 20 }).catch(() => null), 5000);
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
      try { result = (await withTimeout(checkOne(j, w.id), 5 * 60 * 1000)) || { error: "The check took too long — use View deal" }; }
      catch (e) { result = { error: String(e.message || e) }; }
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
