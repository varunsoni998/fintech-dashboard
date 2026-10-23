// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open them in a small VISIBLE "price checker" window
// (Chrome pauses hidden tabs, and sites like Expedia only draw their prices when the page is on screen),
// read the final total for the stay, close the tab and send the price back. The window closes by itself.

const ALLOWED = /(^|\.)(booking\.com|expedia\.(?:com|co\.in|co\.uk|ca|com\.au|com\.sg|ae|co\.th|com\.my)|hotels\.com|makemytrip\.com|agoda\.com)$/i;
const GOOGLE = /(^|\.)google\.[a-z.]+$/i;   // Google's own 'redirecting…' page in between
// any real website counts (hotel's own site, booking engines, …) – just not Google itself or our dashboard
const onSite = (host) => !!host && !GOOGLE.test(host) && !/(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/i.test(host);
const KNOWN = ["Booking.com", "Expedia", "Hotels.com", "MakeMyTrip", "Agoda"];
// Always look at prices in rupees (₹). Each rule was checked on the live site.
function inrUrl(u, job) {
  try {
    const x = new URL(u), h = x.hostname, q = x.searchParams, before = x.href;
    const ci = job?.checkIn, co = job?.checkOut, ad = job?.adults, rm = job?.rooms;
    if (/(^|\.)agoda\.com$/i.test(h)) {
      q.set("currency", "INR");
      if (ci && !/\/book\//i.test(x.pathname)) { q.set("checkIn", ci); if (job.nights) q.set("los", String(job.nights)); if (ad) q.set("adults", String(ad)); if (rm) q.set("rooms", String(rm)); }
    } else if (/(^|\.)booking\.com$/i.test(h) && !/^secure\./i.test(h)) {
      if (!ci && !q.get("checkin")) return u;                     // no dates known → don't reload (would lose them)
      q.set("selected_currency", "INR");
      if (ci) { q.set("checkin", ci); q.set("checkout", co); if (ad) q.set("group_adults", String(ad)); if (rm) q.set("no_rooms", String(rm)); if (!q.get("group_children")) q.set("group_children", "0"); }
    } else if (INDIA_SITES.expedia && /(^|\.)expedia\.[a-z.]+$/i.test(h) && !/^www\.expedia\.co\.in$/i.test(h)) {
      x.hostname = "www.expedia.co.in"; q.delete("currency");          // any country's Expedia → the Indian site (₹)
    } else if (INDIA_SITES.hotels && /(^|\.)hotels\.com$/i.test(h) && !/^in\.hotels\.com$/i.test(h)) {
      x.hostname = "in.hotels.com"; q.delete("currency"); q.delete("pos");   // uk./au./www.hotels.com → India site (₹)
    }
    if (/^in\.hotels\.com$/i.test(x.hostname)) { q.set("locale", "en_IN"); q.set("siteid", "300000036"); }
    if (ci && /expedia\.co\.in$|hotels\.com$/i.test(x.hostname) && /Hotel-Information|\/ho\d+/i.test(x.pathname) && !q.get("chkin")) { q.set("chkin", ci); q.set("chkout", co); }
    if (ci && /expedia\.co\.in$|hotels\.com$/i.test(x.hostname) && /Hotel-Search/i.test(x.pathname)) { q.set("startDate", ci); q.set("endDate", co); if (ad) q.set("adults", String(ad)); }
    return x.href === before ? u : x.href;
  } catch {}
  return u;
}
const INDIA_SITES = { expedia: true, hotels: true };
// "View deal" tabs opened from Price Compare → open the rupee version too
const fromDashboard = new Set();
chrome.tabs.onCreated.addListener((t) => {
  if (!t.openerTabId) return;
  chrome.tabs.get(t.openerTabId).then(o => { if (/businessos[^/]*\.vercel\.app|localhost|127\.0\.0\.1/.test(o.url || "")) fromDashboard.add(t.id); }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (!fromDashboard.has(id) || !info.url) return;
  const fixed = inrUrl(info.url);
  if (fixed !== info.url) { fromDashboard.delete(id); chrome.tabs.update(id, { url: fixed }).catch(() => {}); }
});
chrome.tabs.onRemoved.addListener((id) => fromDashboard.delete(id));
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
  const cents = (v) => Math.round(v * 100) / 100;
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
  let snippet = "", clicked = false;
  const inrLink = (u) => { try { const x = new URL(u); if (/agoda\.com$/i.test(x.hostname)) x.searchParams.set("currency", "INR"); return x.href; } catch { return u; } };
  const label = (b) => clean(b.innerText || b.value || "").trim().split(/\n/).map(x => x.trim()).filter(Boolean)[0] || "";
  const ss = { get: (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  // press the booking button of the cheapest room (this only opens the site's checkout / booking form – nothing is booked)
  const pressCheapest = async (scope, btnRx, room) => {
    const btns = [...scope.querySelectorAll("button, a, [role='button']")].filter(b => btnRx.test(label(b)) && b.getClientRects().length > 0);
    const priced = btns.map(b => {
      let c = b, amt = 0;
      for (let k = 0; k < 8 && c; k++, c = c.parentElement) {
        const ms = [...clean(c.innerText).matchAll(rx(R + AMT))].map(x => num(x[1])).filter(v => v > 100);
        if (ms.length) { amt = ms[ms.length - 1]; break; }
      }
      return { b, amt };
    }).filter(x => x.amt);
    const pick = priced.sort((a, b) => a.amt - b.amt)[0] || (btns[0] && { b: btns[0] });
    if (!pick) return false;
    if (room) ss.set("pcRoom", room);
    ss.set("pcPressed", String(Date.now()));
    pick.b.scrollIntoView({ block: "center" }); await sleep(600); pick.b.click();
    return true;
  };

  for (let t = 0; t < 30; t++) {
    const txt = clean(document.body?.innerText || "");
    if (/captcha|are you a robot|bot or not|robot or human|are you human|verify you are human|unusual traffic|access denied|press (and|&) hold/i.test(document.title + " " + txt) && txt.length < 6000)
      return { robot: true, debug: txt.slice(0, 300) };

    if ((site === "Expedia" || site === "Hotels.com") && /checkout/i.test(location.pathname + location.hostname)) {
      // checkout: "Total ₹17,496.70" (room + taxes + resort fee). Never touch the form or the "Book" button.
      const m = [...txt.matchAll(rx("(?:^|\\n)\\s*Total\\s*\\n?\\s*" + R + AMT))].pop();
      if (m && num(m[1]) > 100) return { total: cents(num(m[1])), room: ss.get("pcRoom"), url: location.href, allRooms: true, free: /fully refundable|free cancellation/i.test(txt) };
    } else if (site === "Expedia" || site === "Hotels.com") {
      // a "how would you like to pay?" box after pressing Reserve → take the first option
      if (ss.get("pcPressed")) {
        const shown = (e) => e.getClientRects().length > 0;
        // the smallest visible box that offers the payment choices
        const dlg = [...document.querySelectorAll("[role='dialog'], dialog, [class*='sheet'], [class*='Dialog'], [data-stid*='dialog']")]
          .filter(d => shown(d) && [...d.querySelectorAll("button, a")].some(b => /^(pay now|pay at property|pay later)$/i.test(label(b))))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
        if (dlg && !clicked) {
          const opts = [...dlg.querySelectorAll("button, a")].filter(b => /^(pay now|pay at property|pay later)$/i.test(label(b))).map(b => {
            let c = b, amt = 0;
            for (let k = 0; k < 7 && c && c !== dlg; k++, c = c.parentElement) { const m = clean(c.innerText).match(new RegExp(R + AMT + "\\s*total", "i")); if (m) { amt = num(m[1]); break; } }
            return { b, amt };
          });
          const pick = opts.filter(o => o.amt).sort((x, y) => x.amt - y.amt)[0] || opts[0];
          if (pick) { clicked = true; ss.set("pcPay", label(pick.b)); pick.b.click(); return { wait: true }; }
        }
      }
      const HOTEL_LINK = 'a[href*="Hotel-Information"], a[href*="/ho"]';
      const isHotelLink = (a) => /Hotel-Information|\/ho\d+/i.test(a.getAttribute("href") || "");
      if (/Hotel-Search|search\.do|\/search/i.test(location.pathname)) {
        // 1) the hotel Google linked to is pinned at the top under "Continue with your booking" → its total is right there
        // list of hotels → open THIS hotel's own page.
        // The hotel Google linked to is pinned at the top under "Continue with your booking".
        const links = [...document.querySelectorAll(HOTEL_LINK)].filter(isHotelLink);
        let selId = ""; try { selId = new URL(location.href).searchParams.get("selected") || ""; } catch {}
        const exact = selId && links.find(a => new RegExp("\\.h" + selId + "\\.|[?&]selected=" + selId + "\\b|/ho" + selId + "/").test(a.getAttribute("href") || ""));
        if (exact) return { go: exact.href };
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
        // the room list: Expedia marks it "section-room-list"; heading is "Choose your room" or, for apartments, "Choose your unit"
        const listEl = document.querySelector("[data-stid='section-room-list']");
        const start = listEl ? 0 : txt.search(/Choose your (?:room|unit|apartment|villa)s?|Select a room|Room options/i);
        if (start >= 0) {
          const base = listEl ? clean(listEl.innerText) : txt;
          const rest = base.slice(start + 15);
          const stop = rest.search(/\n(Similar properties|Explore similar|Compare similar|You may also like|Have a question\?|Popular properties|Properties nearby|Nearby properties|About this property|About the property|Policies|Important information|Guest reviews|Reviews\n|Explore the area|Accessibility)/i);
          const sec = base.slice(start, start + 15 + (stop >= 0 ? stop : rest.length));
          const found = [];
          for (const b of sec.split(/View all photos for /i).slice(1)) {
            const room = b.split("\n")[0].trim();
            const mm = [...b.matchAll(rx(R + AMT + "\\s*total\\b"))];
            if (mm.length) found.push({ total: num(mm[0][1]), room, free: /Fully refundable|Free cancellation/i.test(b) });
          }
          if (!found.length) for (const mm of sec.matchAll(rx(R + AMT + "\\s*total\\b"))) found.push({ total: num(mm[1]), room: "" });
          const c = cheapest(found);
          // the room list's "total" leaves out resort fees → open the checkout of the cheapest room to see the full total
          const pressedAgo = Date.now() - (+ss.get("pcPressed") || 0);
          if (c && !clicked && pressedAgo > 60000) {
            if (await pressCheapest(document.body, /^(reserve|select|book now)$/i, c.room)) { clicked = true; return { wait: true }; }
          }
          // couldn't reach the checkout → room-list total (resort fee may be extra)
          if (c && ((pressedAgo < 60000 && t >= 12) || (pressedAgo >= 60000 && t >= 6))) return { total: cents(c.total), room: c.room, free: !!c.free, options: found.length, url: location.href };
        }
      }
    } else if (site === "Booking.com" && /searchresults/i.test(location.pathname)) {
      // Google sometimes opens Booking's list of hotels → open THIS hotel's page, keeping the dates and ₹
      const cards = [...document.querySelectorAll("[data-testid='property-card']")];
      const scored = cards.map(c => ({ c, s: overlap(hotelName, (c.querySelector("[data-testid='title']") || c).textContent || "") })).sort((x, y) => y.s - x.s);
      let destHotel = false; try { destHotel = new URL(location.href).searchParams.get("dest_type") === "hotel"; } catch {}
      const best = (scored[0] && scored[0].s >= 0.5) ? scored[0].c : (destHotel && cards[0]) || null;
      const a = best && best.querySelector("a[data-testid='title-link'], a[href*='/hotel/']");
      if (a) {
        const to = new URL(a.href, location.href), from = new URL(location.href).searchParams;
        for (const k of ["checkin", "checkout", "group_adults", "no_rooms", "group_children", "selected_currency"]) if (from.get(k)) to.searchParams.set(k, from.get(k));
        return { go: to.href };
      }
      if (t > 10 && cards.length) return { error: "Booking.com showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
      await sleep(1000); continue;
    } else if (site === "Booking.com") {
      const rows = [...document.querySelectorAll("#hprt-table tbody tr, table.hprt-table tbody tr")];
      const head = clean(document.querySelector("#hprt-table thead, table.hprt-table thead")?.innerText || "");
      const hn = head.match(/Price for (\d+) nights?/i);
      if (rows.length && hn && nights && +hn[1] !== nights) return { error: `Booking.com showed prices for ${hn[1]} nights, not ${nights}`, debug: head.slice(0, 200) };
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
          found.push({ total, room, free: /Free cancellation/i.test(rt), row: r });
        }
        const c = cheapest(found);
        // go to Booking's checkout for the full price + cancellation terms: choose 1 of the cheapest room, press "I'll reserve"
        // (this only opens the "Your details" page – nothing is typed or booked)
        const pressedAgo = Date.now() - (+ss.get("pcPressed") || 0);
        if (c && !clicked && pressedAgo > 60000) {
          const sel = c.row.querySelector("select.hprt-nos-select, select[name^='nr_rooms_']");
          const one = sel && [...sel.options].find(o => o.value === "1");
          const btn = [...document.querySelectorAll("button")].find(b => /ll\W*reserve/i.test(b.innerText || "") && !/room for/i.test(b.innerText || ""));
          if (sel && one && btn) {
            sel.value = "1"; sel.dispatchEvent(new Event("change", { bubbles: true }));
            ss.set("pcPressed", String(Date.now())); clicked = true;
            await sleep(1000); btn.scrollIntoView({ block: "center" }); await sleep(400); btn.click();
            return { wait: true };
          }
        }
        if (c && (pressedAgo >= 60000 || t >= 12)) return { total: cents(c.total), room: c.room, free: c.free, options: found.length, url: location.href };
      }
      // the room Google linked to is often shown at the top: "₹ 55,151 … Includes taxes and charges" / "+₹ X taxes and charges"
      // checkout page (Google often links straight here): "Total ₹ 67,467.66 Includes taxes and charges"
      if (/^secure\./i.test(location.hostname) || /book\.html/i.test(location.pathname)) {
        const tm = [...txt.matchAll(rx("(?:^|\\n)\\s*Total\\s*\\n?\\s*" + R + AMT))].pop();
        if (tm && num(tm[1]) > 100) {
          const rm = txt.match(/\n\s*([^\n]{3,70})\n\s*(?:Partially refundable|Free cancellation|Non-refundable|Fully refundable)/i);
          return { total: cents(num(tm[1])), room: rm ? rm[1].trim() : "", url: location.href, allRooms: true, free: /Free cancellation/i.test(txt) };
        }
      }
      // checkout page (older layout): "Price ₹ 36,029.60  +₹ 6,485.33 taxes and charges"
      const p = [...txt.matchAll(rx("\\bPrice\\s*" + R + AMT + "[^₹]{0,30}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];
      if (p) { const rm = txt.match(/\n\s*1\s*x\s*([^\n]+)/i); return { total: cents(num(p[1]) + num(p[2])), room: rm ? rm[1].trim() : "", url: location.href, allRooms: true }; }
    } else if (site === "MakeMyTrip") {
      // "₹ 4,999  + ₹ 600 taxes & fees  Per Night"
      const per = [...txt.matchAll(rx(R + AMT + "\\s*\\+\\s*" + R + AMT + "\\s*taxes\\s*(?:&|and)\\s*fees"))].map(m => (num(m[1]) + num(m[2])) * (nights || 1));
      if (per.length) return { total: cents(Math.min(...per)), url: location.href };
    } else if (site === "Agoda") {
      // Agoda's full price (with taxes and its "extra charges") is only shown on the booking form:
      // "Price  Rs. 25,716.37"  (not "Price Before Taxes", not "Room price"). Room name is in the address (roomName=…).
      if (/\/book\//i.test(location.pathname) || /booking form/i.test(document.title)) {
        const m = [...txt.matchAll(rx("(?:^|\\n)\\s*(?:Total price|Price)\\s*\\n?\\s*" + R + AMT))].pop();
        if (m) {
          let rm = ""; try { rm = new URL(location.href).searchParams.get("roomName") || ""; } catch {}
          return { total: cents(num(m[1])), room: rm || ss.get("pcRoom"), url: location.href, allRooms: true, free: /free cancellation/i.test(txt) && !/non-refundable/i.test(txt) };
        }
      } else if (/\/search/i.test(location.pathname)) {
        // search results (Google sometimes links here): the card for this hotel ("selectedproperty") → its own page
        const cards = [...document.querySelectorAll("[data-selenium='hotel-item']")];
        let sel = ""; try { sel = new URL(location.href).searchParams.get("selectedproperty") || ""; } catch {}
        const card = (sel && cards.find(c => c.getAttribute("data-hotelid") === sel))
          || cards.map(c => ({ c, s: overlap(hotelName, (c.querySelector("[data-selenium='hotel-name']") || c).textContent || "") })).sort((a, b) => b.s - a.s).find(x => x.s >= 0.5)?.c;
        const a = card && [...card.querySelectorAll("a[href]")].find(x => /propertyId=|\/hotel\//i.test(x.getAttribute("href") || ""));
        if (a) return { go: inrLink(new URL(a.getAttribute("href"), location.href).href) };
        if (t > 12 && cards.length) return { error: "Agoda showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
        await sleep(1000); continue;
      } else if (!clicked && Date.now() - (+ss.get("pcPressed") || 0) > 20000) {
        // hotel page: each offer is [data-testid=room-offer] with "₹ 7,057 Per night before taxes & fees", "2 adults"
        // and a "Book" button whose label names the room ("Book Deluxe Palm View Double Room Offer 1").
        const offers = [...document.querySelectorAll("[data-testid='room-offer'], [data-element-name='mob-room-offer'], [data-selenium='ChildRoomsList-room']")].map(o => {
          const ot = clean(o.innerText);
          const pm = ot.match(new RegExp(R + AMT + "\\s*(?:Per night|per room per night|/ night)", "i"));
          const b = o.querySelector("button[data-element-name*='book' i], [data-testid='book-button'] button, button[aria-label^='Book' i]")
            || [...o.querySelectorAll("button, a")].find(x => /^(book|book now|reserve)$/i.test(clean(x.innerText).trim()));
          const ad = ot.match(/(\d+)\s*adults?/i);
          return { o, b, amt: pm ? num(pm[1]) : 0, adults: ad ? +ad[1] : null, room: ((b && b.getAttribute("aria-label")) || "").replace(/^Book\s+/i, "").replace(/\s+Offer\s+\d+$/i, "") };
        }).filter(x => x.b && x.amt && (x.adults === null || x.adults >= adults));
        if (offers.length) {
          const pick = offers.sort((x, y) => x.amt - y.amt)[0];
          ss.set("pcRoom", pick.room); ss.set("pcPressed", String(Date.now())); clicked = true;
          pick.b.scrollIntoView({ block: "center" }); await sleep(700); pick.b.click();
          return { wait: true };
        }
        // room list not on screen yet → move down step by step until it appears (never jump to the bottom)
        const grid = document.querySelector("#roomGridContent, [data-element-name='room-grid'], #roomSection");
        if (grid && t % 3 === 0) grid.scrollIntoView({ block: "start" });
        else if (!grid) { const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50; if (atBottom) window.scrollTo(0, 0); else window.scrollBy(0, 600); }
        await sleep(1000); continue;
      }
    } else {
      // any other website (the hotel's own site / its booking engine): read the stay total it shows
      const LABEL = "(?:grand total|total price|total for (?:your |the )?stay|total stay|total amount|total cost|total charges|amount payable|total payable|you pay|total)";
      const tot = [...txt.matchAll(rx(LABEL + "([^0-9\\n]{0,40}?)" + R + AMT))]
        .filter(m => !/sav|discount|off|deposit|tax(es)? only/i.test(m[0])).map(m => num(m[2])).filter(v => v > 100);
      const tot2 = [...txt.matchAll(rx(R + AMT + "[ \\t]*(?:total|in total|for " + (nights || 1) + " nights?)\\b"))].map(m => num(m[1])).filter(v => v > 100);
      // some booking engines write the currency after the number: "Total 11,655.00 INR"
      const RA = "\\s?(?:INR|₹|Rs\\.?|USD|US\\$|EUR|€|AED|GBP|£|SGD|AUD|THB)";
      const tot3 = [...txt.matchAll(rx(LABEL + "([^0-9\\n]{0,40}?)" + AMT + RA))]
        .filter(m => !/sav|discount|off|deposit/i.test(m[0])).map(m => num(m[2])).filter(v => v > 100);
      const all = [...tot, ...tot2, ...tot3];
      if (all.length && t >= 3) return { total: cents(Math.min(...all)), room: "", url: location.href };
      if (t >= 12) {
        const per = [...txt.matchAll(rx(R + AMT + "[ \\t]*(?:/|per|a|avg\\.?(?: per)?)\\s*night"))].map(m => num(m[1])).filter(v => v > 100);
        if (per.length) return { total: cents(Math.min(...per) * (nights || 1)), room: "", url: location.href };
      }
      // homepage instead of the booking page → press its "Check availability" button once (opens the booking engine, books nothing)
      if (t === 5 && !ss.get("pcPressed")) {
        const go = [...document.querySelectorAll("button, a, input[type=submit]")].find(e => e.offsetParent !== null && /^(check availability|check rates|view rates|see rates|search|find rooms|show rooms|book now)$/i.test(clean(e.innerText || e.value).trim()));
        if (go) { ss.set("pcPressed", String(Date.now())); go.click(); return { wait: true }; }
      }
      if (t >= 20) return { error: "The hotel's website didn't show a price for these dates", debug: (location.hostname + " · " + txt.slice(0, 300)) };
      await sleep(1000); continue;                               // no scrolling on hotel websites
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
  if (r && r.total) {
    r.currency = pageCurrency();
    // cancellation wording as the site writes it (checkout pages show it for the chosen room)
    const t = (document.body?.innerText || "").replace(/[\u00a0\u202f\u2009]/g, " ");
    const pats = [/Free cancell?ation (?:before|until|till|by)[^\n]{0,60}/i, /Fully refundable (?:before|until)[^\n]{0,40}(?:\n[^\n]{0,40})?/i, /Cancel for free (?:before|until)[^\n]{0,50}/i,
      /If you cancel,? you['’]ll pay[^\n]{0,40}/i, /Partially refundable[^\n]{0,60}/i, /Non-?refundable/i, /Free cancell?ation/i];
    const bits = []; for (const p of pats) { const m = t.match(p); if (m && !bits.some(b => b.includes(m[0].trim()))) bits.push(m[0].replace(/\s+/g, " ").trim()); if (bits.length >= 2) break; }
    if (bits.length) r.cxlText = bits.join(" · ");
  }
  return r;
}

async function waitForSite(tabRef, ms, known) {
  // tabRef can be a function: Chrome may swap the tab for a new one while it redirects
  // Ready when the tab is on the booking site AND (finished loading OR has been there 6 s).
  // Some sites (Expedia) never report "finished" because adverts keep loading.
  // If Google's redirect page stays on screen, follow its link to the booking site ourselves.
  const end = Date.now() + ms;
  let onSiteSince = 0, onGoogleSince = 0, host = "", nudged = 0;
  while (Date.now() < end) {
    const tabId = typeof tabRef === "function" ? tabRef() : tabRef;
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) { await sleep(700); const again = typeof tabRef === "function" ? tabRef() : tabRef; if (again !== tabId) continue; throw new Error("Tab closed"); }
    try { host = new URL(t.url || t.pendingUrl || "").hostname; } catch { host = ""; }
    if (known ? ALLOWED.test(host) : onSite(host)) {
      if (!onSiteSince) onSiteSince = Date.now();
      if (t.status === "complete" || Date.now() - onSiteSince > 6000) return;
    } else {
      onSiteSince = 0;
      if (GOOGLE.test(host)) {
        if (!onGoogleSince) onGoogleSince = Date.now();
        if (Date.now() - onGoogleSince > 5000 && nudged < 2) {
          nudged++; onGoogleSince = Date.now();
          try {
            const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
              const notG = (h) => !/(^|\.)google\.[a-z.]+$|gstatic|googleusercontent|youtube/i.test(h);
              const u0 = new URL(location.href);
              for (const k of ["url", "adurl", "q", "dest"]) { try { const w = new URL(u0.searchParams.get(k) || ""); if (/^https?:$/.test(w.protocol) && notG(w.hostname)) return w.href; } catch {} }
              for (const a of document.querySelectorAll("a[href]")) {
                try { const u = new URL(a.href); if (/^https?:$/.test(u.protocol) && notG(u.hostname)) return u.href; } catch {}
              }
              return "";
            } });
            if (res?.result) await chrome.tabs.update(tabId, { url: res.result });
          } catch { /* can't read Google's page */ }
        }
      } else onGoogleSince = 0;
    }
    await sleep(500);
  }
  if (onSite(host)) throw new Error(`The site took too long to open (${host})`);
  throw new Error(host ? `The link stopped at ${host} instead of the booking site` : "The link didn't open a booking site");
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
  if (!KNOWN.includes(job.source)) return { error: "Hotel websites aren't checked automatically" };
  const tab = await chrome.tabs.create({ url: job.url, active: true, windowId });
  let cur = tab.id;
  const opened = [];                                             // a site may open its booking form in a NEW tab
  const onNew = (t) => { if (t.openerTabId === cur) opened.push(t.id); };
  const onSwap = (added, removed) => { if (removed === cur) { cur = added; opened.push(added); } };   // Chrome swapped the tab (prerender)
  chrome.tabs.onCreated.addListener(onNew);
  chrome.tabs.onReplaced.addListener(onSwap);
  const other = !KNOWN.includes(job.source);                     // hotel's own site → also read inside booking-engine frames
  try {
    let robotDone = false; const fixedHosts = new Map(); const trail = [];
    for (let hop = 0; hop < 10; hop++) {
      await waitForSite(() => cur, 45000, !other);
      try { const u = new URL((await chrome.tabs.get(cur)).url), d = u.searchParams.get("checkin") || u.searchParams.get("chkin") || u.searchParams.get("startDate") || u.searchParams.get("checkIn"); trail.push(u.hostname + u.pathname.slice(0, 40) + (d ? " (" + d + ")" : "")); } catch {}
      { // switch to ₹ + the trip's dates once per site (not on the ad-redirect pages in between)
        const now = (await chrome.tabs.get(cur).catch(() => null))?.url || "";
        let host = ""; try { host = new URL(now).hostname; } catch {}
        if (host && ALLOWED.test(host) && (fixedHosts.get(host) || 0) < 2) {
          fixedHosts.set(host, (fixedHosts.get(host) || 0) + 1);
          const fixed = inrUrl(now, job);
          if (fixed !== now) { await chrome.tabs.update(cur, { url: fixed }); await sleep(1500); continue; }
        }
      }
      await sleep(2000);
      let r;
      try {
        const res = await chrome.scripting.executeScript({ target: { tabId: cur, allFrames: other }, func: readSitePrice, args: [job.source, job.nights, job.adults || 2, job.hotel || ""] });
        const rs = res.map(x => x?.result).filter(Boolean);
        r = rs.find(x => x.total) || rs.find(x => x.robot || x.go || x.wait) || res[0]?.result;
      } catch (e) { await sleep(2000); continue; }             // the page changed while reading → try again
      if (r?.go) { await chrome.tabs.update(cur, { url: r.go }); await sleep(1500); continue; }   // list page → this hotel's page
      if (r?.wait) {                                             // pressed "Book now" → wait for the booking form
        const before = (await chrome.tabs.get(cur).catch(() => null))?.url;
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          if (opened.length) { cur = opened.pop(); break; }
          const now = (await chrome.tabs.get(cur).catch(() => null))?.url;
          if (now && now !== before) break;
        }
        await sleep(1500);
        continue;
      }
      if (r?.robot) {
        if (robotDone) return { error: "The robot test came back — use View deal", debug: r.debug };
        const ok = await waitForPerson(cur, windowId, job);
        if (!ok) return { error: "Robot test not completed — use View deal", debug: r.debug };
        robotDone = true;
        continue;                                                // test gone → read the price
      }
      const out = Object.assign(r || { error: "Couldn't read the page" }, { trail });
      if (out.total || (out.error && !out.robot)) {
        out.shot = await snapPrice(cur, windowId, out.total);   // for the vision check
        // full cancellation policy: open the site's "cancellation policy" pop-up (Booking.com) or read the written policy
        const pol = await grabPolicy(cur);
        if (pol.text) out.policyText = pol.text;
        if (pol.opened) { await sleep(700); out.shot2 = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 }).catch(() => ""); await closePolicy(cur); }
        else out.shot2 = await snapCancel(cur, windowId);    // cancellation terms (may be lower on the page)
      }
      return out;
    }
    return { error: "The site kept redirecting" };
  } finally {
    chrome.tabs.onCreated.removeListener(onNew);
    chrome.tabs.onReplaced.removeListener(onSwap);
    chrome.tabs.remove([tab.id, ...opened, cur].filter((v, i, a) => a.indexOf(v) === i)).catch(() => {});
  }
}

// Screenshot of the price for the vision check: bring the total (or the price summary) into view, then capture the window
async function snapPrice(tabId, windowId, total) {
  try {
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, args: [total || 0], func: (tot) => {
      let el = null;
      if (tot) {
        const re = new RegExp(String(Math.floor(tot)).split("").join("[,.\\s]?"));
        el = [...document.querySelectorAll("body *")].filter(e => e.children.length <= 4 && e.getClientRects().length && re.test((e.innerText || "").replace(/\s/g, "")))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0] || null;
      }
      if (!el) el = [...document.querySelectorAll("h2, h3, h4, div, span")].find(e => /^(total|price details|price summary|your price summary|choose your room|choose your unit)$/i.test((e.innerText || "").trim()));
      if (el) el.scrollIntoView({ block: "center" });
    } }).catch(() => {});
    await sleep(900);
    return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 });
  } catch { return ""; }
}

// Read the complete cancellation policy. Only opens an information pop-up (and closes it again) – never books anything.
async function grabPolicy(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: async () => {
      const shown = (e) => e.getClientRects().length > 0;
      const clean = (t) => (t || "").replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\n{2,}/g, "\n").trim();
      const dialogText = () => {
        const d = [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], dialog")]
          .filter(x => shown(x) && /cancel/i.test(x.innerText || "")).sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
        return d ? clean(d.innerText).slice(0, 1500) : "";
      };
      // 1) a button that opens the policy (Booking.com: "More details on cancellation and prepayment policies")
      const btn = [...document.querySelectorAll("button, a, [role='button']")].find(e => shown(e) && (
        /cancell?ation (and prepayment )?polic|cancellation and prepayment|info on .*cancell?ation/i.test(e.getAttribute("aria-label") || "") ||
        /^(cancell?ation policy|see cancell?ation policy|view cancell?ation policy|policy details)$/i.test((e.innerText || "").trim())));
      if (btn && !dialogText()) { btn.click(); await new Promise(r => setTimeout(r, 1500)); const t = dialogText(); if (t) return { text: t, opened: true }; }
      // 2) the policy written on the page (Expedia / Hotels.com / Agoda): the "Cancellation policy" section
      const head = [...document.querySelectorAll("h1, h2, h3, h4, h5, div, span, p, strong")]
        .find(e => shown(e) && /^(cancell?ation polic(y|ies)|cancell?ation)$/i.test((e.innerText || "").trim()));
      if (head) {
        let box = head.parentElement;
        for (let k = 0; k < 4 && box && (box.innerText || "").length < 120; k++) box = box.parentElement;
        const t = clean(box?.innerText || "");
        if (t.length > 20) return { text: t.slice(0, 1500), opened: false };
      }
      return { text: "", opened: false };
    } });
    return res?.result || { text: "", opened: false };
  } catch { return { text: "", opened: false }; }
}
async function closePolicy(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const d = [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], dialog")].find(x => x.getClientRects().length && /cancel/i.test(x.innerText || ""));
    const x = d && [...d.querySelectorAll("button")].find(b => /close|dismiss/i.test(b.getAttribute("aria-label") || "") || /^(close|×|✕)$/i.test((b.innerText || "").trim()));
    if (x) x.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  } }).catch(() => {});
}

async function snapCancel(tabId, windowId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const el = [...document.querySelectorAll("h2, h3, h4, div, span, p")]
        .filter(e => e.children.length <= 6 && e.getClientRects().length && /cancell?ation policy|how much will it cost to cancel|free cancell?ation|fully refundable|non-?refundable|cancel for free/i.test(e.innerText || ""))
        .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return "same";   // already in the first screenshot
      el.scrollIntoView({ block: "center" }); return true;
    } });
    if (res?.result !== true) return "";
    await sleep(800);
    return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 });
  } catch { return ""; }
}

async function logResult(job, result) {
  const { pcLog = [] } = await chrome.storage.local.get("pcLog");
  const { shot, shot2, ...rest } = result || {};
  pcLog.unshift({ at: Date.now(), site: job.source, url: job.url, ...rest, hadShot: !!shot, version: chrome.runtime.getManifest().version, dates: job.checkIn ? job.checkIn + " → " + job.checkOut : "" });
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
