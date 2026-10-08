/**
 * PriceCompare.tsx — Skyscanner-style hotel price comparison (dashboard colours).
 * Online prices from every booking site Google Hotels knows (backend /api/prices, SerpApi),
 * plus the team's own supplier rates (Ottila, TBO, DMC). Cheapest first, no markup.
 *  • "Your hotels" (added by name) are pinned first with every site's price.
 *  • "Other hotels in <city>" lists the rest of the city (only hotels that have a price).
 * Ottila-style rooms picker; ROE fetched automatically; prices searched in the trip currency.
 * "Download Excel" writes the standard CustomHolidays costing sheet.
 */
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import {
  Scale, Plus, Minus, X, Search, Loader2, Download, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
  Star, ExternalLink, ChevronDown, ChevronUp, BedDouble, KeyRound, Users, Pin, Zap,
} from "lucide-react";

const API = "https://fintech-dashboard-61vh.onrender.com/api/prices";
const STORE = "pc:trip:v3";
const CORR = "pc:corr:v1";   // learned "website price ÷ Google price" per site (+ per city), from confirmed prices
const words = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["hotel", "the", "and", "resort", "by"].includes(w));
const nameMatch = (a: string, b: string) => { const A = new Set(words(a)), B = words(b); if (!A.size || !B.length) return 0; return B.filter(w => A.has(w)).length / Math.max(A.size, B.length); };
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const MEALS = ["RO", "BB", "HB", "FB", "AI"];
const LABELS = ["", "base", "upg 1", "upg 2", "upg 3"];
const CCYS = ["USD", "EUR", "CHF", "GBP", "AED", "SGD", "THB", "AUD", "INR"];
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", AED: "AED ", SGD: "S$", THB: "฿", AUD: "A$", INR: "₹" };

interface OnlinePrice { source: string; total: number; per_night: number; free_cancellation: boolean; link?: string; before_tax?: number | null; room?: string | null }
interface Online { found: boolean; name?: string; stars?: number; rating?: number; reviews?: number; image?: string; link?: string; prices: OnlinePrice[]; suggestions?: string[]; currency?: string; roeAt?: number }
interface Hotel {
  id: string; name: string; room: string; meal: string; label: string; inPkg: boolean;
  ottila: string; tbo: string; otherSource: string; other: string; cancel: string;
  mine?: boolean; token?: string; image?: string; stars?: number; rating?: number; reviews?: number; fromPrice?: number; fromSource?: string; fromLink?: string;
  online?: Online; confirmed?: Record<string, number>; confirmedAuto?: Record<string, number>; loading?: boolean; error?: string; searchedFor?: string; open?: boolean; showRates?: boolean; checkedAt?: number;
}
type SortKey = "cheapest" | "best" | "rated";
interface City { id: string; name: string; checkIn: string; checkOut: string; stars: number; hotels: Hotel[]; sort: SortKey; finding?: boolean; foundFor?: string; newName?: string }
interface Room { adults: number; ages: number[] }
interface Trip { name: string; roomList: Room[]; currency: string; roe: string; roeNote: string; gst: string; tcs: string; notes: string; perNight?: boolean; cities: City[] }
interface Deal { source: string; rupees: number; amt: number; ccy: string; before?: number; mine: boolean; free: boolean; link?: string; google?: number; confirmed?: boolean; est?: number; room?: string; fx?: { kind: string; f: number; n: number; lo: number; hi: number } }

const uid = () => Math.random().toString(36).slice(2, 9);
const newHotel = (p: Partial<Hotel> = {}): Hotel => ({ id: uid(), name: "", room: "", meal: "BB", label: "", inPkg: false, ottila: "", tbo: "", otherSource: "DMC", other: "", cancel: "", ...p });
const newCity = (): City => ({ id: uid(), name: "", checkIn: "", checkOut: "", stars: 5, hotels: [], sort: "cheapest" });
const EMPTY: Trip = { name: "", roomList: [{ adults: 2, ages: [] }], currency: "USD", roe: "", roeNote: "", gst: "5", tcs: "2", notes: "", cities: [newCity()] };
const isMine = (h: Hotel) => h.mine ?? !h.token;   // added by name = yours; from "other hotels" = not

function loadTrip(): Trip {
  try {
    const t = JSON.parse(localStorage.getItem(STORE) || "");
    if (t?.cities && t?.roomList) {
      // prices saved by older versions in USD/EUR are dropped, so everything shown is in ₹ as the sites show it
      t.cities = t.cities.map((c: City) => ({ ...c, finding: false, hotels: c.hotels.map((h: Hotel) =>
        h.online?.currency && h.online.currency !== "INR" ? { ...h, online: undefined, searchedFor: undefined, checkedAt: undefined, open: false, loading: false } : { ...h, loading: false }) }));
      return t;
    }
  } catch { /* */ }
  try { // older version of this page → keep its cities/hotels
    const o = JSON.parse(localStorage.getItem("pc:trip:v2") || "");
    if (o?.cities) return { ...EMPTY, name: o.name || "", currency: o.currency || "USD", gst: o.gst ?? "5", tcs: o.tcs ?? "2", notes: o.notes || "", cities: o.cities, roomList: [{ adults: o.adults || 2, ages: [] }] };
  } catch { /* */ }
  return EMPTY;
}

const nightsOf = (c: City) => { const a = Date.parse(c.checkIn), b = Date.parse(c.checkOut); return a && b && b > a ? Math.round((b - a) / 86400000) : 0; };
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] || "th");
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00"); return isNaN(+d) ? iso : `${ord(d.getDate())} ${d.toLocaleString("en", { month: "short" })}`; };
const num = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : v; };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
const money = (v: number, ccy: string) => ccy === "INR" ? inr(v) : `${SYMBOL[ccy] || ccy + " "}${Math.round(v).toLocaleString("en-IN")}`;
const ratingWord = (r?: number) => !r ? "" : r >= 4.7 ? "Exceptional" : r >= 4.5 ? "Excellent" : r >= 4.2 ? "Very good" : r >= 3.8 ? "Good" : "Okay";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clock = (t?: number) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

// ── rooms text ("4 Adults, 1 Child in 2 Rooms") ────────────────────────────────
const roomSummary = (rs: Room[]) => {
  const a = rs.reduce((s, r) => s + r.adults, 0), c = rs.reduce((s, r) => s + r.ages.length, 0);
  return `${plural(a, "Adult", "Adults")}${c ? `, ${plural(c, "Child", "Children")}` : ""} in ${plural(rs.length, "Room", "Rooms")}`;
};
const ROOM_KIND: Record<number, string> = { 1: "SGL", 2: "DBL", 3: "TPL", 4: "QUAD" };
const roomsForExcel = (rs: Room[]) => {
  const g = new Map<string, { n: number; r: Room }>();
  rs.forEach(r => { const k = `${r.adults}|${r.ages.join(",")}`; g.set(k, { n: (g.get(k)?.n || 0) + 1, r }); });
  const parts = [...g.values()].map(({ n, r }) => `${n} ${ROOM_KIND[r.adults] || `${r.adults} pax`}${r.ages.length ? ` + ${r.ages.length} CHD (${r.ages.join(", ")}y)` : ""}`);
  return `${plural(rs.length, "Room", "Rooms")} (${parts.join(", ")})`;
};
const paxForExcel = (rs: Room[]) => {
  const a = rs.reduce((s, r) => s + r.adults, 0), ages = rs.flatMap(r => r.ages);
  return `${plural(a, "Adult", "Adults")}${ages.length ? `, ${plural(ages.length, "Child", "Children")} (${ages.join(", ")} yrs)` : ""}`;
};

async function authFetch(path: string, body?: any) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${data.session?.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { let m = `Error ${res.status}`; try { m = (await res.json()).detail || m; } catch { /* */ } throw new Error(m); }
  return res;
}

export default function PriceCompare() {
  const { dark } = useDarkMode();
  // ── Dashboard palette (neumorphic) ─────────────────────────────────────────
  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_OUT = dark ? "5px 5px 12px #0D0D1A, -5px -5px 12px #272744" : "5px 5px 12px #C4C4D4, -5px -5px 12px #FFFFFF";
  const SHADOW_SM = dark ? "3px 3px 7px #0D0D1A, -3px -3px 7px #272744" : "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF";
  const SHADOW_IN = dark ? "inset 3px 3px 7px #0D0D1A, inset -3px -3px 7px #272744" : "inset 3px 3px 7px #C4C4D4, inset -3px -3px 7px #FFFFFF";
  const TEXT = dark ? "#D0D0F0" : "#3A3A5A";
  const MUTED = dark ? "#7070A0" : "#9090A8";
  const ACCENT = "#6B7FD4";
  const GRAD = "linear-gradient(135deg,#7B8FE0,#5B6FD0)";
  const GREEN = "#2FA37A", PURPLE = "#9B6BD4", WARN = "#C98A2B", ERR = "#D1435B";
  const TINT = dark ? "rgba(107,127,212,0.14)" : "rgba(107,127,212,0.10)";

  const card: React.CSSProperties = { background: BG, borderRadius: 18, boxShadow: SHADOW_OUT };
  const inp: React.CSSProperties = { background: BG, boxShadow: SHADOW_IN, border: "none", borderRadius: 12, padding: "10px 12px", fontSize: 14, color: TEXT, outline: "none", width: "100%" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: MUTED, display: "flex", flexDirection: "column", gap: 5, textTransform: "uppercase", letterSpacing: 0.3 };
  const pill = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" });
  const btn = (kind: "primary" | "ghost" = "ghost"): React.CSSProperties => ({
    background: kind === "primary" ? GRAD : BG, color: kind === "primary" ? "#fff" : TEXT,
    boxShadow: SHADOW_SM, border: "none", borderRadius: 12, padding: "10px 15px", fontSize: 13.5, fontWeight: 700,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  });
  const round: React.CSSProperties = { width: 30, height: 30, borderRadius: 99, border: "none", background: BG, boxShadow: SHADOW_SM, color: ACCENT, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  const [trip, setTrip] = useState<Trip>(loadTrip);
  const [status, setStatus] = useState<{ configured: boolean; keys?: number; searches_left?: number; active_key?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [roeBusy, setRoeBusy] = useState(false);
  const [roeErr, setRoeErr] = useState("");
  const [corr, setCorr] = useState<Record<string, number[]>>(() => { try { return JSON.parse(localStorage.getItem(CORR) || "{}") || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem(CORR, JSON.stringify(corr)); } catch { /* */ } }, [corr]);
  const cityOf = (h: Hotel) => (trip.cities.find(c => c.hotels.some(x => x.id === h.id))?.name || "").trim().toLowerCase();
  // learned correction for a site: same city first (1+ check), else that site anywhere (3+ checks)
  // How reliable is Google for this site? Uses checks from the same city first, else the site everywhere (3+ checks).
  //  exact  → all checks within ±2%: no change, shown as "usually exact"
  //  adjust → 2+ checks, all off the same way by a similar amount (spread ≤ 6%): price corrected by the median
  //  varies → checks go both ways / spread out: NO correction, flagged "confirm before quoting"
  //  hint   → only 1 check: no correction, just shows what that check found
  type Fx = { kind: "exact" | "adjust" | "varies" | "hint"; f: number; n: number; lo: number; hi: number };
  const factor = (site: string, city: string): Fx | null => {
    const local = corr[`${site}|${city}`] || [], all = corr[site] || [];
    const use = local.length ? local : all.length >= 3 ? all : [];
    if (!use.length) return null;
    const d = use.map(r => r - 1), lo = Math.min(...d), hi = Math.max(...d), n = use.length, f = median(use);
    if (d.every(x => Math.abs(x) <= 0.02)) return { kind: "exact", f: 1, n, lo, hi };
    if (n === 1) return { kind: "hint", f: 1, n, lo, hi };
    const sameWay = (lo > 0.02 && hi > 0) || (hi < -0.02 && lo < 0);
    if (sameWay && hi - lo <= 0.06) return { kind: "adjust", f, n, lo, hi };
    return { kind: "varies", f: 1, n, lo, hi };
  };
  const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const [editing, setEditing] = useState<{ hid: string; source: string; value: string } | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* */ } }, [trip]);
  const loadStatus = () => authFetch("/status").then(r => r.json()).then(setStatus).catch(() => setStatus({ configured: false }));
  useEffect(() => { loadStatus(); }, []);

  // ── Grab-price Chrome extension: receives the exact checkout price from a booking page ──
  type Grab = { id: number; site: string; hotel: string; total: number; url: string; checkIn?: string; checkOut?: string };
  const [extReady, setExtReady] = useState(false);
  const [extAuto, setExtAuto] = useState(false);
  const [checks, setChecks] = useState<Record<string, string>>({});   // "hid|site" → "checking" | "ok" | error text
  const onCheckMsg = useRef<(m: any) => void>(() => {});
  const [grab, setGrab] = useState<Grab | null>(null);
  const [grabSel, setGrabSel] = useState<{ hid: string; site: string }>({ hid: "", site: "" });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.source !== "pc-grab-ext") return;
      if (e.data.type === "PC_EXT_READY") { setExtReady(true); if (e.data.auto) setExtAuto(true); }
      if (/^PC_CHECK_/.test(e.data.type)) onCheckMsg.current(e.data);
      if (e.data.type === "PC_GRAB_PRICE" && e.data.grab?.total > 0) { setExtReady(true); setGrab(e.data.grab); }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "pc-page", type: "PC_PING" }, location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const setT = (p: Partial<Trip>) => setTrip(t => ({ ...t, ...p }));
  const cc = trip.currency, roe = num(trip.roe);

  // ── ROE: fetched automatically whenever the currency changes (and on open) ─
  const fetchRoe = async (ccy = cc) => {
    if (ccy === "INR") { setT({ roe: "1", roeNote: "" }); return; }
    setRoeBusy(true); setRoeErr("");
    try {
      const r = await (await authFetch(`/roe?ccy=${ccy}`)).json();
      setTrip(t => (t.currency !== ccy ? t : { ...t, roe: String(r.roe), roeNote: `${r.source} · ${r.date}${r.stale ? " (last known)" : ""}` }));
    } catch (e: any) { setRoeErr(e.message); }
    finally { setRoeBusy(false); }
  };
  useEffect(() => { fetchRoe(cc); }, [cc]);

  const fmtCc = (rupees: number) => (cc === "INR" || !roe ? "" : money(rupees / roe, cc));
  // Online prices are fetched in ₹ — exactly what the sites show a customer browsing from India —
  // and converted to the trip currency with the ROE (no double conversion via USD/EUR).
  const searchCcy = "INR";

  const setCity = (cid: string, p: Partial<City>) => setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id === cid ? { ...c, ...p } : c)) }));
  const setHotel = (cid: string, hid: string, p: Partial<Hotel>) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, ...p } : h)) })) }));

  // ── Rooms picker ───────────────────────────────────────────────────────────
  const rooms = trip.roomList;
  const setRoom = (i: number, p: Partial<Room>) => setT({ roomList: rooms.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const setChildren = (i: number, n: number) => {
    const ages = rooms[i].ages.slice(0, n); while (ages.length < n) ages.push(5);
    setRoom(i, { ages });
  };
  const apiRooms = rooms.map(r => ({ adults: r.adults, children_ages: r.ages }));
  const nRooms = rooms.length;

  // all prices for a hotel (supplier rates + every site), cheapest first — no limit
  const deals = (h: Hotel): Deal[] => {
    const rate = h.online?.roeAt || 1, ccy = h.online?.currency || "INR";
    return [
      ...([["Ottila", h.ottila], ["TBO", h.tbo], [h.otherSource || "Other", h.other]] as [string, string][])
        .filter(([, v]) => num(v) > 0).map(([s, v]) => ({ source: s, rupees: num(v), amt: num(v), ccy: "INR", mine: true, free: !!h.cancel })),
      ...(h.online?.prices || []).map(p => {
        const cf = h.confirmed?.[p.source];     // price the team checked on the website itself
        return cf
          ? { source: p.source, room: p.room || undefined, rupees: cf, amt: cf, ccy: "INR", mine: false, free: p.free_cancellation, link: p.link, google: p.total * rate, confirmed: true }
          : (() => {
              const g = p.total * rate, fx = factor(p.source, cityOf(h));
              return fx?.kind === "adjust"
                ? { source: p.source, room: p.room || undefined, rupees: g * fx.f, amt: g * fx.f, ccy: "INR", mine: false, free: p.free_cancellation, link: p.link, google: g, est: fx.n, fx }
                : { source: p.source, room: p.room || undefined, rupees: g, amt: p.total, ccy, mine: false, free: p.free_cancellation, link: p.link, google: g, fx: fx || undefined };
            })();
      }),
      // prices confirmed (e.g. grabbed from a site) that Google doesn't list for this hotel
      ...Object.entries(h.confirmed || {}).filter(([src]) => !(h.online?.prices || []).some(p => p.source === src))
        .map(([src, v]) => ({ source: src, rupees: v, amt: v, ccy: "INR", mine: false, free: false, confirmed: true } as Deal)),
    ].sort((a, b) => a.rupees - b.rupees);
  };
  const bestOf = (h: Hotel) => deals(h)[0]?.rupees ?? (h.online ? undefined : h.fromPrice);
  const hasPrice = (h: Hotel) => !!bestOf(h);

  // ── Searching ──────────────────────────────────────────────────────────────
  const key = (c: City, h: Hotel) => `${h.name}|${c.name}|${c.checkIn}|${c.checkOut}|${JSON.stringify(rooms)}|${searchCcy}`;
  const findKey = (c: City) => `${c.name}|${c.checkIn}|${c.checkOut}|${c.stars}|${JSON.stringify(rooms)}`;

  // one hotel → every site's price (1 search)
  const fetchOne = async (c: City, h: Hotel, fresh = false, open = true): Promise<Online | null> => {
    const rate = searchCcy === "INR" ? 1 : roe;
    setHotel(c.id, h.id, { loading: true, error: undefined });
    try {
      const r: Online = await (await authFetch("/search", { hotel: h.name, city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, currency: searchCcy, property_token: h.token, rooms: apiRooms, fresh })).json();
      const online = { ...r, currency: r.currency || searchCcy, roeAt: rate };
      setHotel(c.id, h.id, { loading: false, online, searchedFor: key(c, h), checkedAt: Date.now(), open, confirmed: h.searchedFor === key(c, h) ? h.confirmed : undefined,
        token: h.token || (r as any).property_token, image: h.image || r.image, rating: h.rating ?? r.rating, reviews: h.reviews ?? r.reviews, stars: h.stars ?? r.stars });
      return online;
    } catch (e: any) { setHotel(c.id, h.id, { loading: false, error: e.message }); return null; }
  };
  const runSearches = async (jobs: { c: City; h: Hotel }[], fresh = false) => {
    const work = async () => { for (let j = jobs.shift(); j; j = jobs.shift()) await fetchOne(j.c, j.h, fresh); };
    await Promise.all([work(), work(), work()]);
  };

  const findHotels = async (c: City) => {
    setCity(c.id, { finding: true });
    try {
      const r = await (await authFetch("/discover", { city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, stars: c.stars || null, currency: "INR", limit: 25, rooms: apiRooms })).json();
      setTrip(t => ({ ...t, cities: t.cities.map(x => {
        if (x.id !== c.id) return x;
        // keep your hotels + anything you labelled / put in the package; replace the rest with the new list
        const keep = x.hotels.filter(h => isMine(h) || h.inPkg || h.label);
        const have = new Set(keep.map(h => h.name.toLowerCase()));
        const add = (r.hotels || []).filter((y: any) => y.name && y.lowest_total && !have.has(y.name.toLowerCase())).map((y: any) =>
          newHotel({ name: y.name, mine: false, token: y.property_token, image: y.image, stars: y.stars, rating: y.rating, reviews: y.reviews, fromPrice: y.lowest_total, fromSource: y.lowest_source || undefined, fromLink: y.lowest_link || undefined }));
        return { ...x, finding: false, foundFor: findKey(c), hotels: [...keep, ...add] };
      }) }));
    } catch (e: any) { setCity(c.id, { finding: false }); setMsg({ kind: "err", text: e.message }); }
  };

  // Search a city: your hotels get every site's price; the rest of the city is listed below.
  const searchCity = async (c: City, fresh = false) => {
    if (!c.name.trim() || !nightsOf(c)) { setMsg({ kind: "err", text: `Enter the city and dates${c.name ? ` for ${c.name}` : ""}.` }); return; }
    const jobs = c.hotels.filter(h => h.name.trim() && (isMine(h) || (fresh && h.online)) && (fresh || h.searchedFor !== key(c, h))).map(h => ({ c, h }));
    await Promise.all([runSearches(jobs, fresh), fresh || c.foundFor !== findKey(c) ? findHotels(c) : Promise.resolve()]);
  };
  const searchAll = async (only?: City, fresh = false) => {
    setMsg(null); setBusy(true);
    for (const c of only ? [only] : trip.cities) await searchCity(c, fresh);
    setBusy(false); loadStatus();
  };
  const seeAll = async (c: City, h: Hotel) => {
    if (h.online && h.searchedFor === key(c, h)) return setHotel(c.id, h.id, { open: !h.open });
    await fetchOne(c, h, true); loadStatus();
  };
  // the team types the total they see on the website → replaces Google's price everywhere (ranking, Excel)
  const applyConfirm = (c: City, h: Hotel, source: string, v: number, auto = false) => {
    if (!(v > 0)) return;
    setTrip(t => ({ ...t, cities: t.cities.map(x => x.id !== c.id ? x : { ...x, hotels: x.hotels.map(y => {
      if (y.id !== h.id) return y;
      const ca = { ...(y.confirmedAuto || {}) }; if (auto) ca[source] = Date.now(); else delete ca[source];
      return { ...y, confirmed: { ...(y.confirmed || {}), [source]: v }, confirmedAuto: ca };
    }) }) }));
    // learn how far Google was off for this site (and this city), to correct other hotels' prices
    const g = (h.online?.prices || []).find(p => p.source === source);
    const ratio = g ? v / (g.total * (h.online?.roeAt || 1)) : 0;
    if (ratio > 0.5 && ratio < 2) {
      const city = c.name.trim().toLowerCase(), k1 = `${source}|${city}`, k2 = source;
      setCorr(o => ({ ...o, [k1]: [...(o[k1] || []), ratio].slice(-25), [k2]: [...(o[k2] || []), ratio].slice(-50) }));
    }
  };
  const saveConfirm = (c: City, h: Hotel) => {
    if (!editing) return;
    applyConfirm(c, h, editing.source, num(editing.value));
    setEditing(null);
  };
  // all hotels on the trip, for matching a grabbed price
  const allHotels = trip.cities.flatMap(c => c.hotels.filter(h => h.name.trim()).map(h => ({ c, h })));
  useEffect(() => {
    if (!grab) return;
    const scored = allHotels.map(({ h }) => ({ h, s: nameMatch(h.online?.name || h.name, grab.hotel) + ((h.online?.prices || []).some(p => p.source === grab.site) ? 0.15 : 0) + (h.checkedAt ? h.checkedAt / 1e14 : 0) }))
      .sort((a, b) => b.s - a.s);
    setGrabSel({ hid: scored[0]?.h.id || "", site: grab.site });
  }, [grab?.id]);
  const applyGrab = () => {
    const hit = allHotels.find(x => x.h.id === grabSel.hid);
    if (!grab || !hit) return;
    applyConfirm(hit.c, hit.h, grabSel.site || grab.site, grab.total);
    window.postMessage({ source: "pc-page", type: "PC_GRAB_DONE", id: grab.id }, location.origin);
    setMsg({ kind: "ok", text: `✓ ${grabSel.site} ${inr(grab.total)} confirmed for ${hit.h.name}.` });
    setGrab(null);
  };
  // ── ⚡ automatic exact prices: the extension opens each deal link in a background tab and reads the total ──
  const AUTO_SITES = ["Booking.com", "Expedia", "Hotels.com", "MakeMyTrip"];
  const sameRooms = rooms.every(r => r.adults === rooms[0].adults && r.ages.join() === rooms[0].ages.join());
  const autoJobs = (list: { c: City; h: Hotel }[]) => list.flatMap(({ c, h }) =>
    (h.online?.prices || []).filter(p => AUTO_SITES.includes(p.source) && p.link)
      .map(p => ({ cid: c.id, hid: h.id, source: p.source, url: p.link as string, nights: nightsOf(c) || 1, mult: sameRooms ? nRooms : 1 })));
  const autoCheck = (list: { c: City; h: Hotel }[]) => {
    if (!extAuto) { setMsg({ kind: "err", text: "Install (or update) the Grab-price Chrome extension to get exact prices automatically." }); return; }
    if (!sameRooms) { setMsg({ kind: "err", text: "Exact-price check works when all rooms have the same guests. Confirm mixed rooms by hand." }); return; }
    const jobs = autoJobs(list);
    if (!jobs.length) { setMsg({ kind: "err", text: "Nothing to check — open the hotel's prices first (Search / See all prices)." }); return; }
    setChecks(o => ({ ...o, ...Object.fromEntries(jobs.map(j => [`${j.hid}|${j.source}`, "queued"])) }));
    window.postMessage({ source: "pc-page", type: "PC_CHECK", jobs }, location.origin);
    setMsg({ kind: "ok", text: `⚡ Checking ${plural(jobs.length, "price", "prices")} on the websites in background tabs — keep Chrome open…` });
  };
  onCheckMsg.current = (m: any) => {
    const j = m.job; const k = j ? `${j.hid}|${j.source}` : "";
    if (m.type === "PC_CHECK_STARTED") setChecks(o => ({ ...o, [k]: "checking" }));
    if (m.type === "PC_CHECK_RESULT") {
      const city = trip.cities.find(c => c.id === j.cid), hotel = city?.hotels.find(h => h.id === j.hid);
      if (m.result?.total > 0 && city && hotel) { applyConfirm(city, hotel, j.source, m.result.total * (j.mult || 1), true); setChecks(o => ({ ...o, [k]: "ok" })); }
      else setChecks(o => ({ ...o, [k]: m.result?.error || "Couldn't read the price" }));
    }
    if (m.type === "PC_CHECK_DONE") setMsg({ kind: "ok", text: "⚡ Exact-price check finished." });
  };
  const dismissGrab = () => { if (grab) window.postMessage({ source: "pc-page", type: "PC_GRAB_DONE", id: grab.id }, location.origin); setGrab(null); };
  const clearConfirm = (c: City, h: Hotel, source: string) => {
    const next = { ...(h.confirmed || {}) }; delete next[source];
    setHotel(c.id, h.id, { confirmed: next });
  };
  // "View deal" before "See all prices": open the tab straight away, get the exact deal link (1 search), then go there
  const viewDeal = async (c: City, h: Hotel) => {
    if (h.fromLink) { window.open(h.fromLink, "_blank", "noopener"); return; }
    const w = window.open("about:blank", "_blank");
    if (w) w.document.write(`<p style="font:16px sans-serif;padding:24px">Opening ${h.fromSource || "the best deal"} for ${h.name}…</p>`);
    const r = await fetchOne(c, h, true, false); loadStatus();
    const list = (r?.prices || []).slice().sort((a, b) => a.total - b.total);
    const pick = list.find(p => p.source === h.fromSource) || list[0];
    const url = pick?.link || (pick ? `https://www.google.com/search?q=${encodeURIComponent(`${pick.source} ${h.name} ${c.name}`)}` : "");
    if (w && url) { w.opener = null; w.location.href = url; }
    else { w?.close(); setMsg({ kind: "err", text: `${h.name}: none of your sites have a price for these dates.` }); }
  };
  const addByName = (c: City) => {
    const name = (c.newName || "").trim(); if (!name) return;
    setCity(c.id, { hotels: [newHotel({ name, mine: true }), ...c.hotels], newName: "" });
  };

  // ── Sorting like Skyscanner (Best / Cheapest / Top rated) ──────────────────
  // discovered hotels sort by their list price, so a card doesn't jump when you open its prices
  const sortPrice = (h: Hotel) => (!isMine(h) && h.fromPrice ? h.fromPrice : bestOf(h));
  const sortList = (hs: Hotel[], by: SortKey) => {
    const bestOf = sortPrice;
    const prices = hs.map(bestOf).filter((x): x is number => !!x);
    const min = prices.length ? Math.min(...prices) : 1;
    const score = (h: Hotel) => { const p = bestOf(h); if (!p) return -1; return ((h.rating || 4) / 5) * 0.6 + (min / p) * 0.4; };
    return [...hs].sort((a, b) =>
      by === "cheapest" ? (bestOf(a) ?? 9e12) - (bestOf(b) ?? 9e12)
      : by === "rated" ? (b.rating || 0) - (a.rating || 0) || (bestOf(a) ?? 9e12) - (bestOf(b) ?? 9e12)
      : score(b) - score(a));
  };

  // ── Excel (standard costing layout, no markup) ─────────────────────────────
  const downloadExcel = async () => {
    setMsg(null);
    if (cc !== "INR" && !roe) { fetchRoe(); return setMsg({ kind: "err", text: `Getting today's ${cc} rate — try again in a moment.` }); }
    const asCost = (d: Deal) => (d.ccy === cc && cc !== "INR" ? { currency: cc, amount: d.amt } : { currency: "INR", amount: Math.round(d.rupees) });
    const sections = trip.cities.filter(c => c.hotels.some(h => h.name.trim())).map(c => {
      const rows: any[] = [];
      const pick = c.hotels.filter(h => h.name.trim() && (isMine(h) || h.inPkg || h.label || h.online));
      for (const h of sortList(pick, "cheapest")) {
        const ds = deals(h);
        const online = ds.filter(d => !d.mine);
        const bcom = online.find(d => /booking\.com/i.test(d.source));
        const cmpP = bcom || online[0];
        const compare = cmpP ? { source: bcom ? "B.com" : cmpP.source, ...asCost(cmpP), meal: h.meal, cancel: cmpP.free ? "Free cxl" : undefined } : undefined;
        const remark = online.length ? online.slice(0, 8).map(d => `${d.source} ${money(d.amt, d.ccy)}${d.confirmed ? " (confirmed)" : d.est ? " (est.)" : " (Google)"}`).join(" · ") : undefined;
        const desc = `${h.name}${h.stars ? ` ${h.stars}*` : ""} x${nRooms} ${h.room || deals(h).find(d => !d.mine && d.room)?.room || "Room"}`;
        if (!ds.length) {
          rows.push(h.fromPrice ? { bid: h.label || undefined, description: desc, source: "Google (from)", currency: "INR", amount: h.fromPrice, meal: h.meal, markup: 0, pkg: h.inPkg ? ["A"] : [] }
            : { bid: h.label || undefined, description: desc, source: "", meal: h.meal, notes: "Not available online" });
          continue;
        }
        const mine = ds.filter(d => d.mine);
        const main = mine.length ? mine : [ds[0]];
        main.forEach((d, i) => rows.push({ bid: h.label || undefined, description: desc, source: d.source, ...asCost(d), meal: h.meal,
          cancel: d.mine ? h.cancel || undefined : d.free ? "Free cxl" : undefined, markup: 0, pkg: h.inPkg && i === 0 ? ["A"] : [],
          compare: d.mine || (bcom && d.source !== bcom.source) ? compare : undefined, remark: i === 0 ? remark : undefined }));
      }
      return { title: `${c.name} ${nice(c.checkIn)} to ${nice(c.checkOut)} ${nightsOf(c)}N`, rows };
    });
    const body = {
      sheet_name: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", ""),
      trip: { name: trip.name || "Trip", rooms: roomsForExcel(rooms), pax: paxForExcel(rooms), notes: trip.notes, costing_currency: cc,
              rates: cc === "INR" ? {} : { [cc]: roe }, markup: 0, gst: num(trip.gst) / 100, tcs: num(trip.tcs) / 100 },
      sections, packages: [{ key: "A", name: "Per package" }],
    };
    try {
      setBusy(true);
      const blob = await (await authFetch("/excel", body)).blob();
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `${trip.name || "Trip"} costing.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMsg({ kind: "ok", text: "Excel downloaded in the standard costing layout (your hotels + any you labelled or put in the package)." });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); } finally { setBusy(false); }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  // total (₹ + the site's own currency) and per night, always both
  const priceBlock = (rupees: number, n: number, opts: { amt?: number; ccy?: string; before?: number; big?: boolean } = {}) => {
    const siteCcy = opts.ccy && opts.ccy !== "INR" && opts.amt ? money(opts.amt, opts.ccy) : fmtCc(rupees);
    return (
      <div style={{ textAlign: "right", lineHeight: 1.2 }}>
        <div style={{ fontSize: opts.big ? 24 : 16, fontWeight: 800, color: TEXT }}>{inr(rupees)}</div>
        {siteCcy && <div style={{ fontSize: opts.big ? 13 : 11.5, color: MUTED, fontWeight: 700 }}>{siteCcy}</div>}
        <div style={{ fontSize: opts.big ? 12.5 : 11.5, color: ACCENT, fontWeight: 700, whiteSpace: "nowrap" }}>{inr(rupees / n)} / night</div>
        {nRooms > 1 && <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{inr(rupees / n / nRooms)} / room / night</div>}
      </div>
    );
  };
  const Stepper = ({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button style={{ ...round, opacity: value <= min ? 0.4 : 1 }} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus style={{ width: 14, height: 14 }} /></button>
      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800, color: TEXT, fontSize: 15 }}>{value}</span>
      <button style={{ ...round, opacity: value >= max ? 0.4 : 1 }} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus style={{ width: 14, height: 14 }} /></button>
    </div>
  );
  const sectionTitle = (text: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 4px 0" }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{text}</span>
      {sub && <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>}
    </div>
  );

  const hotelCard = (c: City, h: Hotel, n: number, badges: { cheapest: boolean; best: boolean; rated: boolean }) => {
    const ds = deals(h); const best = ds[0]; const mineHotel = isMine(h);
    const showDeals = mineHotel ? ds.length > 0 : !!(h.open && h.online && ds.length);
    const link = (d: Deal) => d.link || `https://www.google.com/search?q=${encodeURIComponent(`${d.source} ${h.name} ${c.name}`)}`;
    const notOnline = h.online && (!h.online.found || !h.online.prices.length);
    return (
      <div key={h.id} style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 250px", minHeight: 150 }} className="max-md:!grid-cols-1">
          {/* image */}
          <div style={{ position: "relative", padding: 10 }}>
            {h.image ? <img src={h.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 140, borderRadius: 14 }} />
              : <div style={{ height: "100%", minHeight: 140, borderRadius: 14, boxShadow: SHADOW_IN, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><BedDouble style={{ width: 34, height: 34 }} /></div>}
            <div style={{ position: "absolute", top: 18, left: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {mineHotel && <span style={pill(GRAD)}>Your hotel</span>}
              {badges.cheapest && <span style={pill(GREEN)}>Cheapest</span>}
              {badges.best && <span style={pill(ACCENT)}>Best</span>}
              {badges.rated && <span style={pill(PURPLE)}>Top rated</span>}
            </div>
          </div>

          {/* details */}
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{h.online?.name && mineHotel ? h.online.name : h.name}</span>
              {h.stars ? <span style={{ display: "inline-flex" }}>{Array.from({ length: h.stars }).map((_, i) => <Star key={i} style={{ width: 13, height: 13, color: "#F5B400", fill: "#F5B400" }} />)}</span> : null}
              <div style={{ flex: 1 }} />
              <button title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }} onClick={() => setCity(c.id, { hotels: c.hotels.filter(x => x.id !== h.id) })}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            {h.rating ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ ...pill(GRAD), fontSize: 12 }}>{h.rating.toFixed(1)}</span>
                <b style={{ color: TEXT }}>{ratingWord(h.rating)}</b>
                {h.reviews ? <span style={{ color: MUTED }}>{h.reviews.toLocaleString("en-IN")} reviews</span> : null}
              </div>
            ) : null}
            {h.loading && <div style={{ fontSize: 12.5, color: ACCENT, display: "flex", gap: 5, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Checking every booking site{nRooms > 1 ? ` for ${nRooms} rooms` : ""}…</div>}
            {h.error && <div style={{ fontSize: 12.5, color: ERR }}>{h.error}</div>}
            {notOnline && <div style={{ fontSize: 12.5, color: WARN, fontWeight: 600 }}>Not available online for these dates{h.online?.suggestions?.length ? ` — did you mean: ${h.online.suggestions.slice(0, 3).join(", ")}?` : ""}</div>}
            {mineHotel && !h.online && !h.loading && <div style={{ fontSize: 12.5, color: MUTED }}>Click <b>Search</b> to get every site's price.</div>}
            {h.checkedAt && !h.loading && <div style={{ fontSize: 11.5, color: MUTED }}>Prices checked at {clock(h.checkedAt)}{h.online?.currency && h.online.currency !== "INR" ? ` · quoted in ${h.online.currency}` : ""}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", alignItems: "center", fontSize: 12.5 }}>
              <input style={{ ...inp, width: 170, padding: "7px 9px", fontSize: 12.5 }} value={h.room} placeholder="Room type (for Excel)" onChange={e => setHotel(c.id, h.id, { room: e.target.value })} />
              <select style={{ ...inp, width: 66, padding: "7px 6px", fontSize: 12.5 }} value={h.meal} onChange={e => setHotel(c.id, h.id, { meal: e.target.value })}>{MEALS.map(m => <option key={m}>{m}</option>)}</select>
              <select style={{ ...inp, width: 86, padding: "7px 6px", fontSize: 12.5 }} value={h.label} onChange={e => setHotel(c.id, h.id, { label: e.target.value })}>{LABELS.map(l => <option key={l} value={l}>{l || "label"}</option>)}</select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TEXT, cursor: "pointer" }}>
                <input type="checkbox" checked={h.inPkg} onChange={e => setHotel(c.id, h.id, { inPkg: e.target.checked })} style={{ accentColor: ACCENT }} /> In package
              </label>
              <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: ACCENT }} onClick={() => setHotel(c.id, h.id, { showRates: !h.showRates })}>
                <Plus style={{ width: 12, height: 12 }} /> Ottila / TBO / DMC rate
              </button>
              {h.online && autoJobs([{ c, h }]).length > 0 && <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: GREEN }} onClick={() => autoCheck([{ c, h }])} title="Opens each site in a background tab and reads the exact total">
                <Zap style={{ width: 12, height: 12 }} /> Get exact prices
              </button>}
              {!mineHotel && <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: ACCENT }} onClick={() => setHotel(c.id, h.id, { mine: true })} title="Move to Your hotels">
                <Pin style={{ width: 12, height: 12 }} /> Add to my hotels
              </button>}
            </div>
          </div>

          {/* best price */}
          <div style={{ margin: 10, borderRadius: 14, boxShadow: SHADOW_IN, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 6 }}>
            {best ? (<>
              <div style={{ fontSize: 12, color: MUTED }}>{plural(ds.length, "deal", "deals")} · cheapest on</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{best.source}{best.mine ? " (your rate)" : ""}</div>
              {!best.mine && best.room && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textAlign: "right", maxWidth: 220, display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}><BedDouble style={{ width: 12, height: 12, color: ACCENT }} />{best.room}</div>}
              {!best.mine && (() => {
                const k = best.confirmed ? "confirmed" : best.fx?.kind;
                const look: Record<string, [React.CSSProperties, string]> = {
                  confirmed: [{ ...pill(GREEN) }, "✓ Confirmed on site"],
                  adjust: [{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN }, "≈ est. on site"],
                  exact: [{ ...pill(BG, GREEN), boxShadow: SHADOW_IN }, "✓ usually exact"],
                  varies: [{ ...pill(WARN) }, "⚠ varies — confirm"],
                };
                const [st, txt] = look[k || ""] || [{ ...pill(BG, WARN), boxShadow: SHADOW_IN }, "≈ Google price"];
                return <span style={{ ...st, fontSize: 10.5 }}>{txt}</span>;
              })()}
              {priceBlock(best.rupees, n, { amt: best.amt, ccy: best.ccy, big: true })}
              <div style={{ fontSize: 11.5, color: MUTED, textAlign: "right" }}>total for {plural(n, "night", "nights")}{nRooms > 1 ? `, ${nRooms} rooms` : ""}{best.free ? " · free cancellation" : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!best.mine && <a href={link(best)} target="_blank" rel="noreferrer" style={{ ...btn("primary"), padding: "8px 13px", textDecoration: "none" }}>View deal <ExternalLink style={{ width: 13, height: 13 }} /></a>}
                {!mineHotel && <button style={{ ...btn(), padding: "8px 12px", color: ACCENT }} disabled={h.loading} onClick={() => seeAll(c, h)}>
                  {h.loading ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : h.open ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                  {h.open ? "Hide prices" : "See all prices"}</button>}
              </div>
            </>) : h.fromPrice && !h.online ? (<>
              <div style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>{h.fromSource ? "≈ cheapest on" : "≈ from (Google's lowest)"}</div>
              {h.fromSource && <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{h.fromSource}</div>}
              {priceBlock(h.fromPrice, n, { big: true })}
              <div style={{ fontSize: 11.5, color: MUTED, textAlign: "right" }}>total for {plural(n, "night", "nights")}{nRooms > 1 ? `, ${nRooms} rooms` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button style={{ ...btn("primary"), padding: "8px 13px" }} disabled={h.loading} onClick={() => viewDeal(c, h)} title={h.fromLink ? "" : "Gets the exact deal link (1 search)"}>
                  View deal <ExternalLink style={{ width: 13, height: 13 }} /></button>
                <button style={{ ...btn(), padding: "8px 12px", color: ACCENT }} disabled={h.loading} onClick={() => seeAll(c, h)}>
                  {h.loading ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />} See all prices</button>
              </div>
            </>) : <div style={{ fontSize: 13, color: MUTED, textAlign: "right" }}>{notOnline ? "Not available online" : h.online ? "None of your 6 sites have it" : "No price yet"}</div>}
          </div>
        </div>

        {/* supplier rates */}
        {h.showRates && (
          <div style={{ margin: "0 10px 10px", borderRadius: 14, boxShadow: SHADOW_IN, padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={lbl}>Ottila ₹ (total){nRooms > 1 ? ` · ${nRooms} rooms` : ""}<input style={inp} value={h.ottila} onChange={e => setHotel(c.id, h.id, { ottila: e.target.value })} /></label>
            <label style={lbl}>TBO ₹ (total)<input style={inp} value={h.tbo} onChange={e => setHotel(c.id, h.id, { tbo: e.target.value })} /></label>
            <label style={lbl}>Other source<input style={inp} value={h.otherSource} onChange={e => setHotel(c.id, h.id, { otherSource: e.target.value })} /></label>
            <label style={lbl}>Other ₹ (total)<input style={inp} value={h.other} onChange={e => setHotel(c.id, h.id, { other: e.target.value })} /></label>
            <label style={lbl}>Free cxl until<input style={inp} type="date" value={h.cancel} onChange={e => setHotel(c.id, h.id, { cancel: e.target.value })} /></label>
          </div>
        )}

        {/* every site — no limit */}
        {showDeals && (
          <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "34px 1fr auto 170px 120px", gap: 12, padding: "2px 12px", fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.3 }} className="max-md:!hidden">
              <span /> <span>Website ({ds.length})</span> <span /> <span style={{ textAlign: "right" }}>Total · per night</span> <span />
            </div>
            {ds.map((d, i) => (
              <div key={d.source + i} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto 170px 120px", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: i === 0 ? TINT : "transparent", boxShadow: i === 0 ? "none" : SHADOW_IN }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: d.mine ? GRAD : BG, boxShadow: d.mine ? "none" : SHADOW_SM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: d.mine ? "#fff" : ACCENT }}>{d.source[0]?.toUpperCase()}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                  {d.source}
                  {d.mine && <span style={{ ...pill(ACCENT), marginLeft: 8 }}>your rate</span>}
                  {i === 0 && <span style={{ ...pill(GREEN), marginLeft: 8 }}>cheapest</span>}
                  {i > 0 && best && Math.round(d.rupees - best.rupees) > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: WARN, fontWeight: 600 }}>+{inr(d.rupees - best.rupees)}</span>}
                  {i > 0 && best && Math.round(d.rupees - best.rupees) === 0 && <span style={{ marginLeft: 8, fontSize: 12, color: MUTED, fontWeight: 600 }}>same price</span>}
                  {!d.mine && (
                    <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: d.room ? TEXT : MUTED, opacity: d.room ? 0.85 : 1, display: "flex", alignItems: "center", gap: 5 }}>
                      <BedDouble style={{ width: 13, height: 13, color: ACCENT, flexShrink: 0 }} />
                      {d.room || "Room not shown by Google — check on the site"}
                    </div>
                  )}
                  {!d.mine && !d.confirmed && checks[`${h.id}|${d.source}`] && !["checking", "queued", "ok"].includes(checks[`${h.id}|${d.source}`]) && (
                    <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: WARN }}>⚡ {checks[`${h.id}|${d.source}`]} — use View deal</div>
                  )}
                  {!d.mine && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, fontWeight: 600 }}>
                      {editing && editing.hid === h.id && editing.source === d.source ? (<>
                        <span style={{ color: MUTED }}>Total on {d.source} ₹</span>
                        <input autoFocus value={editing.value} style={{ ...inp, width: 110, padding: "4px 8px", fontSize: 12.5 }}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") saveConfirm(c, h); if (e.key === "Escape") setEditing(null); }} />
                        <button style={{ ...btn("primary"), padding: "4px 10px", fontSize: 11.5 }} onClick={() => saveConfirm(c, h)}>Save</button>
                        <button style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11.5 }} onClick={() => setEditing(null)}>Cancel</button>
                      </>) : checks[`${h.id}|${d.source}`] === "checking" || checks[`${h.id}|${d.source}`] === "queued" ? (<>
                        <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> {checks[`${h.id}|${d.source}`] === "queued" ? "waiting…" : `checking on ${d.source}…`}</span>
                      </>) : d.confirmed ? (<>
                        <span style={{ ...pill(GREEN), fontSize: 10.5 }}>✓ Confirmed on site{h.confirmedAuto?.[d.source] ? " (auto)" : ""}</span>
                        {h.confirmedAuto?.[d.source] && <span style={{ color: MUTED }}>checked {clock(h.confirmedAuto[d.source])} ·</span>}
                        <span style={{ color: MUTED }}>Google said {inr(d.google || 0)}</span>
                        <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }} onClick={() => setEditing({ hid: h.id, source: d.source, value: String(Math.round(d.rupees)) })}>Edit</button>
                        <button style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11.5, padding: 0 }} onClick={() => clearConfirm(c, h, d.source)}>Undo</button>
                      </>) : (<>
                        {d.fx?.kind === "adjust" ? <>
                          <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ est. on site</span>
                          <span style={{ color: MUTED }}>Google {inr(d.google || 0)} · {d.source} is usually {pct(d.fx.f - 1)} here ({plural(d.fx.n, "check", "checks")})</span>
                        </> : d.fx?.kind === "exact" ? <>
                          <span style={{ ...pill(BG, GREEN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>✓ usually exact</span>
                          <span style={{ color: MUTED }}>Google matched the site in {plural(d.fx.n, "check", "checks")}</span>
                        </> : d.fx?.kind === "varies" ? <>
                          <span style={{ ...pill(WARN), fontSize: 10.5 }}>⚠ varies {pct(d.fx.lo)} to {pct(d.fx.hi)}</span>
                          <span style={{ color: WARN }}>Google is unreliable for {d.source} here — confirm before quoting</span>
                        </> : d.fx?.kind === "hint" ? <>
                          <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ Google price</span>
                          <span style={{ color: MUTED }}>1 check so far: site was {pct(d.fx.lo)} vs Google</span>
                        </> : <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ Google price</span>}
                        <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }} onClick={() => setEditing({ hid: h.id, source: d.source, value: "" })}>Confirm price</button>
                      </>)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: d.free ? GREEN : MUTED, fontWeight: 600 }}>{d.free ? (d.mine && h.cancel ? `Free cxl till ${nice(h.cancel)}` : "Free cancellation") : ""}</div>
                {priceBlock(d.rupees, n, { amt: d.amt, ccy: d.ccy })}
                {d.mine ? <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>supplier rate</span>
                  : <a href={link(d)} target="_blank" rel="noreferrer" style={{ ...btn(i === 0 ? "primary" : "ghost"), justifyContent: "center", padding: "7px 10px", fontSize: 12.5, textDecoration: "none" }}>View deal <ExternalLink style={{ width: 12, height: 12 }} /></a>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: GRAD, boxShadow: SHADOW_OUT, display: "flex", alignItems: "center", justifyContent: "center" }}><Scale style={{ width: 22, height: 22, color: "#fff" }} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Price Compare</h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Every booking site plus your Ottila / TBO / DMC rates. Cheapest first, prices as quoted (no markup).</p>
          </div>
          {extReady && <span title="Grab-price Chrome extension is installed" style={{ ...pill(BG, GREEN), boxShadow: SHADOW_IN, fontSize: 12, padding: "7px 12px" }}>✓ Grab-price extension</span>}
          {status?.configured && (
            <span style={{ ...pill(BG, MUTED), boxShadow: SHADOW_IN, fontSize: 12, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <KeyRound style={{ width: 13, height: 13, color: ACCENT }} /> {status.searches_left ?? "?"} searches left{status.keys && status.keys > 1 ? ` · key ${status.active_key ?? "-"} of ${status.keys}` : ""}
            </span>
          )}
          <button style={btn()} onClick={() => { if (confirm("Start a new trip? This clears the current one.")) setTrip({ ...EMPTY, currency: trip.currency, roe: trip.roe, roeNote: trip.roeNote, cities: [newCity()] }); }}><Trash2 style={{ width: 14, height: 14 }} /> New trip</button>
        </div>

        {grab && (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10, border: `2px solid ${GREEN}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...pill(GREEN), fontSize: 12 }}>Price grabbed</span>
              <b style={{ color: TEXT, fontSize: 15 }}>{inr(grab.total)}</b>
              <span style={{ color: MUTED, fontSize: 13 }}>from <b style={{ color: TEXT }}>{grab.site}</b>{grab.hotel ? <> · page says “{grab.hotel}”</> : null}{grab.checkIn ? ` · ${grab.checkIn}${grab.checkOut ? ` → ${grab.checkOut}` : ""}` : ""}</span>
            </div>
            {allHotels.length ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ ...lbl, flex: 2, minWidth: 220 }}>For hotel
                  <select style={inp} value={grabSel.hid} onChange={e => setGrabSel({ ...grabSel, hid: e.target.value })}>
                    {trip.cities.map(c => <optgroup key={c.id} label={c.name || "City"}>{c.hotels.filter(h => h.name.trim()).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</optgroup>)}
                  </select>
                </label>
                <label style={{ ...lbl, flex: 1, minWidth: 150 }}>Website
                  <select style={inp} value={grabSel.site} onChange={e => setGrabSel({ ...grabSel, site: e.target.value })}>
                    {["Booking.com", "Agoda", "Expedia", "Hotels.com", "MakeMyTrip", "Hotel website"].map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <button style={btn("primary")} onClick={applyGrab}><CheckCircle2 style={{ width: 15, height: 15 }} /> Apply as confirmed</button>
                <button style={btn()} onClick={dismissGrab}>Dismiss</button>
              </div>
            ) : <div style={{ fontSize: 13, color: WARN }}>Search a city first, then grab the price again.</div>}
            <div style={{ fontSize: 11.5, color: MUTED }}>Check the dates, rooms and guests on the site match this trip before applying.</div>
          </div>
        )}

        {status && !status.configured && (
          <div style={{ ...card, padding: 12, display: "flex", gap: 8, alignItems: "center", color: WARN, fontSize: 13 }}>
            <AlertTriangle style={{ width: 16, height: 16 }} /> Online search is off: add SERPAPI_KEYS on the server (Render). Supplier rates and the Excel still work.
          </div>
        )}

        {/* Trip bar */}
        <div className="max-md:!grid-cols-2" style={{ ...card, padding: 16, display: "grid", gridTemplateColumns: "1.8fr 2.2fr 0.9fr 1.5fr 0.7fr 0.7fr", gap: 12, alignItems: "start", position: "relative", zIndex: 5 }}>
          <label style={lbl}>Trip / client<input style={inp} value={trip.name} placeholder="Rashi Parekh - Australia" onChange={e => setT({ name: e.target.value })} /></label>

          {/* Guests & rooms (Ottila-style) */}
          <div style={{ ...lbl, position: "relative" }}>
            Guests & rooms
            <button onClick={() => setRoomsOpen(o => !o)} style={{ ...inp, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              <Users style={{ width: 15, height: 15, color: ACCENT }} /> <span style={{ flex: 1 }}>{roomSummary(rooms)}</span> <ChevronDown style={{ width: 15, height: 15, color: MUTED }} />
            </button>
            {roomsOpen && (<>
              <div onClick={() => setRoomsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 8, width: 360, maxWidth: "88vw", zIndex: 50, ...card, padding: 16, textTransform: "none", letterSpacing: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, marginBottom: 10 }}>{roomSummary(rooms)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 380, overflowY: "auto", padding: 4 }}>
                  {rooms.map((r, i) => (
                    <div key={i} style={{ borderRadius: 14, boxShadow: SHADOW_IN, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <b style={{ color: TEXT, fontSize: 14 }}>Room {i + 1}</b>
                        <div style={{ flex: 1 }} />
                        {rooms.length > 1 && <button title="Remove room" onClick={() => setT({ roomList: rooms.filter((_, j) => j !== i) })} style={{ ...round, width: 26, height: 26, color: ERR }}><X style={{ width: 13, height: 13 }} /></button>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: TEXT, fontSize: 13.5, fontWeight: 600 }}>Adults</span>
                        <Stepper value={r.adults} min={1} max={6} onChange={v => setRoom(i, { adults: v })} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: TEXT, fontSize: 13.5, fontWeight: 600 }}>Children</span>
                        <Stepper value={r.ages.length} min={0} max={4} onChange={v => setChildren(i, v)} />
                      </div>
                      {r.ages.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 6 }}>Children Age (in yrs)</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {r.ages.map((a, k) => (
                              <select key={k} value={a} style={{ ...inp, width: 70, padding: "7px 8px" }}
                                onChange={e => setRoom(i, { ages: r.ages.map((x, m) => (m === k ? +e.target.value : x)) })}>
                                {Array.from({ length: 17 }, (_, y) => y + 1).map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button style={{ ...btn(), flex: 1, justifyContent: "center", color: ACCENT, opacity: rooms.length >= 9 ? 0.5 : 1 }} disabled={rooms.length >= 9}
                    onClick={() => setT({ roomList: [...rooms, { adults: 2, ages: [] }] })}><Plus style={{ width: 14, height: 14 }} /> Add Room</button>
                  <button style={{ ...btn("primary"), flex: 1, justifyContent: "center" }} onClick={() => setRoomsOpen(false)}>Done</button>
                </div>
              </div>
            </>)}
          </div>

          <label style={lbl}>Currency<select style={inp} value={cc} onChange={e => setT({ currency: e.target.value, roe: "", roeNote: "" })}>{CCYS.map(c => <option key={c}>{c}</option>)}</select></label>

          {/* ROE — automatic */}
          <div style={lbl}>
            ROE (₹ per 1 {cc})
            <div style={{ ...inp, display: "flex", alignItems: "center", gap: 6, fontWeight: 800, textTransform: "none", letterSpacing: 0 }}>
              <span style={{ flex: 1 }}>{cc === "INR" ? "—" : roe ? `₹ ${roe.toFixed(2)}` : roeBusy ? "Fetching…" : "—"}</span>
              {cc !== "INR" && <button title="Get latest rate" onClick={() => fetchRoe()} style={{ background: "none", border: "none", cursor: "pointer", color: ACCENT, display: "inline-flex", padding: 0 }}>
                <RefreshCw className={roeBusy ? "animate-spin" : ""} style={{ width: 14, height: 14 }} /></button>}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "none", letterSpacing: 0, color: roeErr ? ERR : MUTED }}>
              {cc === "INR" ? "No conversion needed" : roeErr ? (roe ? "Couldn't refresh — using last rate" : roeErr) : trip.roeNote ? `Auto · ${trip.roeNote}` : "Auto"}
            </span>
          </div>

          <label style={lbl}>GST %<input style={inp} value={trip.gst} onChange={e => setT({ gst: e.target.value })} /></label>
          <label style={lbl}>TCS %<input style={inp} value={trip.tcs} onChange={e => setT({ tcs: e.target.value })} /></label>
        </div>

        {trip.cities.map(c => {
          const n = nightsOf(c) || 1;
          const named = c.hotels.filter(h => h.name.trim());
          const mineList = sortList(named.filter(isMine), c.sort);
          // other hotels: only ones that actually have a price
          const others = sortList(named.filter(h => !isMine(h) && (hasPrice(h) || h.fromPrice)), c.sort);
          const visible = [...mineList.filter(hasPrice), ...others];
          const tabs: { k: SortKey; label: string }[] = [{ k: "best", label: "Best" }, { k: "cheapest", label: "Cheapest" }, { k: "rated", label: "Top rated" }];
          const top = (k: SortKey) => sortList(visible, k)[0];
          const ids = { cheapest: top("cheapest")?.id, best: top("best")?.id, rated: top("rated")?.id };
          const badges = (h: Hotel) => ({ cheapest: h.id === ids.cheapest && hasPrice(h), best: h.id === ids.best && hasPrice(h), rated: h.id === ids.rated && !!h.rating });
          const white: React.CSSProperties = { ...lbl, color: "rgba(255,255,255,0.9)" };
          const onGrad: React.CSSProperties = { ...inp, background: "rgba(255,255,255,0.96)", boxShadow: "none", color: "#3A3A5A" };
          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Search bar */}
              <div style={{ background: GRAD, borderRadius: 18, boxShadow: SHADOW_OUT, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "end" }}>
                <label style={{ ...white, gridColumn: "span 2" }}>Where<input style={onGrad} value={c.name} placeholder="City, e.g. Melbourne" onChange={e => setCity(c.id, { name: e.target.value })} /></label>
                <label style={white}>Check-in<input style={onGrad} type="date" value={c.checkIn} onChange={e => setCity(c.id, { checkIn: e.target.value })} /></label>
                <label style={white}>Check-out<input style={onGrad} type="date" value={c.checkOut} onChange={e => setCity(c.id, { checkOut: e.target.value })} /></label>
                <label style={white}>Stars<select style={onGrad} value={c.stars} onChange={e => setCity(c.id, { stars: +e.target.value })}>{[5, 4, 3, 0].map(s => <option key={s} value={s}>{s ? `${s}★` : "Any"}</option>)}</select></label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...btn(), background: "#3F4FA8", color: "#fff", boxShadow: "none", flex: 1, justifyContent: "center" }} disabled={busy || c.finding} onClick={() => searchAll(c)} title="Your hotels: every site's price. Plus other hotels in the city.">
                    {busy || c.finding ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Search
                  </button>
                  {trip.cities.length > 1 && <button title="Remove city" style={{ ...btn(), background: "transparent", color: "#fff", boxShadow: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "10px 11px" }} onClick={() => setT({ cities: trip.cities.filter(x => x.id !== c.id) })}><X style={{ width: 15, height: 15 }} /></button>}
                </div>
              </div>

              {/* Add hotel by name */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input style={{ ...inp, maxWidth: 460, flex: 1, minWidth: 220 }} value={c.newName || ""} placeholder="Add a hotel by name (optional) — press Enter…"
                  onChange={e => setCity(c.id, { newName: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") addByName(c); }} />
                <button style={btn()} onClick={() => addByName(c)}><Plus style={{ width: 14, height: 14 }} /> Add hotel</button>
                <span style={{ fontSize: 12, color: MUTED }}>No hotel added? <b>Search</b> shows all hotels in the city.</span>
              </div>

              {/* Sort tabs */}
              {visible.length > 0 && (
                <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", padding: 6, gap: 6 }}>
                  {tabs.map(t => {
                    const h = top(t.k); const active = c.sort === t.k; const p = h ? bestOf(h) : undefined;
                    return (
                      <button key={t.k} onClick={() => setCity(c.id, { sort: t.k })}
                        style={{ padding: "10px 14px", textAlign: "left", border: "none", borderRadius: 13, background: active ? GRAD : "transparent", boxShadow: active ? SHADOW_SM : "none", cursor: "pointer" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: active ? "#fff" : TEXT }}>{t.label}</div>
                        <div style={{ fontSize: 13, color: active ? "rgba(255,255,255,0.85)" : MUTED }}>{p ? `${inr(p)} · ${inr(p / n)}/night` : "—"}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {named.length === 0 && !c.finding && (
                <div style={{ ...card, padding: 26, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  <BedDouble style={{ width: 28, height: 28, margin: "0 auto 6px", color: ACCENT }} />
                  Enter the city and dates, then <b>Search</b>. Add hotel names first if you want specific hotels at the top.
                </div>
              )}

              {/* Your hotels — pinned first, every site */}
              {mineList.length > 0 && sectionTitle(`Your hotels (${mineList.length})`, "every website's price, cheapest first")}
              {mineList.map(h => hotelCard(c, h, n, badges(h)))}

              {/* The rest of the city */}
              {c.finding && <div style={{ fontSize: 13, color: ACCENT, display: "flex", gap: 6, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Finding hotels in {c.name}…</div>}
              {others.length > 0 && sectionTitle(`${mineList.length ? "Other" : "All"} ${c.stars ? `${c.stars}★ ` : ""}hotels in ${c.name} (${others.length})`, "click See all prices for Booking.com, Agoda, Expedia, Hotels.com, MakeMyTrip & hotel website")}
              {others.map(h => hotelCard(c, h, n, badges(h)))}
            </div>
          );
        })}

        {/* Bottom actions */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btn()} onClick={() => setT({ cities: [...trip.cities, newCity()] })}><Plus style={{ width: 14, height: 14 }} /> Add city</button>
          <button style={btn("primary")} disabled={busy} onClick={() => searchAll()}>{busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Search all cities</button>
          <button style={btn()} disabled={busy} onClick={() => searchAll(undefined, true)} title="Ask Google again for live prices (uses searches)"><RefreshCw style={{ width: 14, height: 14 }} /> Refresh live prices</button>
          <button style={{ ...btn(), color: GREEN }} disabled={busy} title="Exact prices for your hotels (and any you opened), read from the websites in background tabs"
            onClick={() => autoCheck(trip.cities.flatMap(c => c.hotels.filter(h => h.online && (isMine(h) || h.open)).map(h => ({ c, h }))))}>
            <Zap style={{ width: 15, height: 15 }} /> Get exact prices</button>
          <button style={{ ...btn(), color: GREEN }} disabled={busy} onClick={downloadExcel}><Download style={{ width: 15, height: 15 }} /> Download Excel</button>
          <span style={{ fontSize: 12, color: MUTED }}>≈ Google prices can differ from the website (member prices, taxes). Click View deal, then <b>Confirm price</b> — confirmed prices are used for ranking and the Excel. For {roomSummary(rooms).toLowerCase()}.</span>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.kind === "ok" ? GREEN : ERR, display: "flex", gap: 6, alignItems: "center" }}>{msg.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <AlertTriangle style={{ width: 15, height: 15 }} />} {msg.text}</div>}
      </div>
    </DashboardLayout>
  );
}
