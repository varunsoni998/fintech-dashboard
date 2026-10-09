// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open each one in a background tab of YOUR Chrome,
// read the final total for the stay, close the tab and send the price back. Max 3 tabs at a time.

const ALLOWED = /(^|\.)(booking\.com|expedia\.co\.in|expedia\.com|hotels\.com|makemytrip\.com|agoda\.com)$/i;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Runs inside the hotel's page on the booking site. Must be self-contained.
async function readSitePrice(site, nights) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const R = "(?:₹|Rs\\.?|INR)\\s?";
  const AMT = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  for (let t = 0; t < 30; t++) {
    const txt = (document.body?.innerText || "").replace(/ /g, " ");
    let totals = [];
    if (/captcha|are you a robot|verify you are human|access denied/i.test(txt) && txt.length < 3000) return { error: "The site asked for a security check — open it once in Chrome, then try again" };
    if (site === "Expedia" || site === "Hotels.com") {
      // "₹22,648 total  includes taxes & fees"
      totals = [...txt.matchAll(new RegExp(R + AMT + "\\s*total\\b", "gi"))].map(m => num(m[1]));
    } else if (site === "Booking.com") {
      // "₹ 40,473  +₹ 11,214 taxes and charges"   or   "₹ 51,687  Includes taxes and charges"
      totals = [...txt.matchAll(new RegExp(R + AMT + "[^₹]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)", "gi"))].map(m => num(m[1]) + num(m[2]));
      if (!totals.length) totals = [...txt.matchAll(new RegExp(R + AMT + "[^₹]{0,40}?includes taxes and (?:charges|fees)", "gi"))].map(m => num(m[1]));
    } else if (site === "MakeMyTrip") {
      // "₹ 4,999  + ₹ 600 taxes & fees  Per Night"
      const per = [...txt.matchAll(new RegExp(R + AMT + "\\s*\\+\\s*" + R + AMT + "\\s*taxes\\s*(?:&|and)\\s*fees", "gi"))].map(m => num(m[1]) + num(m[2]));
      totals = per.map(p => p * (nights || 1));
    } else {
      return { error: "Not read automatically for this site" };
    }
    totals = totals.filter(x => x > 100);
    if (totals.length) return { total: Math.round(Math.min(...totals)), found: totals.length, url: location.href };
    window.scrollBy(0, 900);                 // rooms often load only when scrolled into view
    await sleep(1000);
  }
  return { error: "Couldn't find the price on the page" };
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

async function checkOne(job) {
  const tab = await chrome.tabs.create({ url: job.url, active: false });
  try {
    await waitForSite(tab.id, 40000);
    await sleep(1500);
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSitePrice, args: [job.source, job.nights] });
    return res?.result || { error: "Couldn't read the page" };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function run(jobs, replyTabId) {
  const queue = [...jobs];
  const send = (msg) => chrome.tabs.sendMessage(replyTabId, msg).catch(() => {});
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      send({ type: "PC_CHECK_STARTED", job: j });
      let result;
      try { result = await checkOne(j); } catch (e) { result = { error: String(e.message || e) }; }
      send({ type: "PC_CHECK_RESULT", job: j, result });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  send({ type: "PC_CHECK_DONE" });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PC_CHECK" && Array.isArray(msg.jobs) && sender.tab?.id) {
    const jobs = msg.jobs.filter(j => j && /^https:\/\//.test(j.url || "")).slice(0, 40);
    run(jobs, sender.tab.id);
    sendResponse({ ok: true, count: jobs.length });
  }
});
