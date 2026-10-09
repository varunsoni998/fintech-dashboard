// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open them in a small VISIBLE "price checker" window
// (Chrome pauses hidden tabs, and sites like Expedia only draw their prices when the page is on screen),
// read the final total for the stay, close the tab and send the price back. The window closes by itself.

const ALLOWED = /(^|\.)(booking\.com|expedia\.co\.in|expedia\.com|hotels\.com|makemytrip\.com|agoda\.com)$/i;
const WINDOWS = 2;                 // checker windows side by side (each reads one site at a time)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Runs inside the hotel's page on the booking site. Must be self-contained.
async function readSitePrice(site, nights) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const R = "(?:₹|Rs\\.?|INR)\\s?";
  const AMT = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  const rx = (s) => new RegExp(s, "gi");
  const all = (txt, s, f) => [...txt.matchAll(rx(s))].map(f);
  // try to bring the rooms / prices section into view
  const jump = () => {
    const el = [...document.querySelectorAll("h2,h3,[id],[data-stid]")].find(e => /choose your room|select your room|^rooms$|room options|availability|room-and-rates|offers/i.test(e.id + " " + (e.getAttribute("data-stid") || "") + " " + (e.textContent || "").slice(0, 40)));
    if (el) el.scrollIntoView({ block: "start" }); else window.scrollBy(0, 900);
  };
  let snippet = "";
  for (let t = 0; t < 35; t++) {
    const txt = (document.body?.innerText || "").replace(/[   ]/g, " ");
    if (/captcha|are you a robot|verify you are human|access denied|press (and|&) hold/i.test(txt) && txt.length < 4000)
      return { error: "The site asked for a security check — open it once in Chrome, then re-check", debug: txt.slice(0, 300) };
    let totals = [];
    if (site === "Expedia" || site === "Hotels.com") {
      // "₹22,648 total" · "₹22,648 total includes taxes & fees" · "Total ₹22,648" · "₹22,648 for 3 nights"
      totals = all(txt, R + AMT + "\\s*total\\b", m => num(m[1]));
      if (!totals.length) totals = all(txt, "\\btotal(?: price)?:?\\s*" + R + AMT, m => num(m[1]));
      if (!totals.length) totals = all(txt, R + AMT + "[^₹]{0,25}?includes taxes", m => num(m[1]));
      if (!totals.length) totals = all(txt, R + AMT + "\\s*for\\s*" + (nights || 1) + "\\s*nights?", m => num(m[1]));
    } else if (site === "Booking.com") {
      // "₹ 40,473  +₹ 11,214 taxes and charges"   or   "₹ 51,687  Includes taxes and charges"
      totals = all(txt, R + AMT + "[^₹]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)", m => num(m[1]) + num(m[2]));
      if (!totals.length) totals = all(txt, R + AMT + "[^₹]{0,40}?includes taxes and (?:charges|fees)", m => num(m[1]));
    } else if (site === "MakeMyTrip") {
      // "₹ 4,999  + ₹ 600 taxes & fees  Per Night"
      totals = all(txt, R + AMT + "\\s*\\+\\s*" + R + AMT + "\\s*taxes\\s*(?:&|and)\\s*fees", m => (num(m[1]) + num(m[2])) * (nights || 1));
    } else {
      return { error: "Not read automatically for this site" };
    }
    totals = totals.filter(x => x > 100);
    if (totals.length) return { total: Math.round(Math.min(...totals)), found: totals.length, url: location.href };
    // keep a small sample of what the page shows, for fixing the reader later
    const i = txt.search(/₹|Rs\.?\s?\d/);
    snippet = i >= 0 ? txt.slice(Math.max(0, i - 120), i + 380) : txt.slice(0, 400);
    jump();
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
    await waitForSite(tab.id, 45000);
    await sleep(2000);
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSitePrice, args: [job.source, job.nights] });
    return res?.result || { error: "Couldn't read the page" };
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
