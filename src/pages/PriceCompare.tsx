/**
 * PriceCompare.tsx — Skyscanner-style hotel price comparison (dashboard colours).
 * Online prices from every booking site Google Hotels knows (backend /api/prices, SerpApi),
 * plus the team's own supplier rates (Ottila, TBO, DMC). Cheapest first, no markup.
 * Ottila-style rooms picker (adults / children / ages per room); ROE fetched automatically.
 * "Download Excel" writes the standard CustomHolidays costing sheet.
 */
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import {
  Scale, Plus, Minus, X, Search, Loader2, Download, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
  Star, ExternalLink, ChevronDown, ChevronUp, BedDouble, MapPin, KeyRound, Users,
} from "lucide-react";

const API = "https://fintech-dashboard-61vh.onrender.com/api/prices";
const STORE = "pc:trip:v3";
const MEALS = ["RO", "BB", "HB", "FB", "AI"];
const LABELS = ["", "base", "upg 1", "upg 2", "upg 3"];
const CCYS = ["USD", "EUR", "CHF", "GBP", "AED", "SGD", "THB", "AUD", "INR"];
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", AED: "AED ", SGD: "S$", THB: "฿", AUD: "A$", INR: "₹" };

interface OnlinePrice { source: string; total: number; per_night: number; free_cancellation: boolean; link?: string }
interface Online { found: boolean; name?: string; stars?: number; rating?: number; reviews?: number; image?: string; link?: string; prices: OnlinePrice[]; suggestions?: string[] }
interface Hotel {
  id: string; name: string; room: string; meal: string; label: string; inPkg: boolean;
  ottila: string; tbo: string; otherSource: string; other: string; cancel: string;
  token?: string; image?: string; stars?: number; rating?: number; reviews?: number; fromPrice?: number;
  online?: Online; loading?: boolean; error?: string; searchedFor?: string; open?: boolean; showRates?: boolean;
}
type SortKey = "cheapest" | "best" | "rated";
interface City { id: string; name: string; checkIn: string; checkOut: string; stars: number; hotels: Hotel[]; sort: SortKey; finding?: boolean; newName?: string }
interface Room { adults: number; ages: number[] }
interface Trip { name: string; roomList: Room[]; currency: string; roe: string; roeNote: string; gst: string; tcs: string; notes: string; perNight: boolean; cities: City[] }

const uid = () => Math.random().toString(36).slice(2, 9);
const newHotel = (p: Partial<Hotel> = {}): Hotel => ({ id: uid(), name: "", room: "", meal: "BB", label: "", inPkg: false, ottila: "", tbo: "", otherSource: "DMC", other: "", cancel: "", ...p });
const newCity = (): City => ({ id: uid(), name: "", checkIn: "", checkOut: "", stars: 5, hotels: [], sort: "cheapest" });
const EMPTY: Trip = { name: "", roomList: [{ adults: 2, ages: [] }], currency: "USD", roe: "", roeNote: "", gst: "5", tcs: "2", notes: "", perNight: false, cities: [newCity()] };

function loadTrip(): Trip {
  try { const t = JSON.parse(localStorage.getItem(STORE) || ""); if (t?.cities && t?.roomList) return t; } catch { /* */ }
  try { // older version of this page → keep its cities/hotels
    const o = JSON.parse(localStorage.getItem("pc:trip:v2") || "");
    if (o?.cities) return { ...EMPTY, name: o.name || "", currency: o.currency || "USD", gst: o.gst ?? "5", tcs: o.tcs ?? "2", notes: o.notes || "", perNight: !!o.perNight, cities: o.cities, roomList: [{ adults: o.adults || 2, ages: [] }] };
  } catch { /* */ }
  return EMPTY;
}

const nightsOf = (c: City) => { const a = Date.parse(c.checkIn), b = Date.parse(c.checkOut); return a && b && b > a ? Math.round((b - a) / 86400000) : 0; };
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] || "th");
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00"); return isNaN(+d) ? iso : `${ord(d.getDate())} ${d.toLocaleString("en", { month: "short" })}`; };
const num = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : v; };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
const ratingWord = (r?: number) => !r ? "" : r >= 4.7 ? "Exceptional" : r >= 4.5 ? "Excellent" : r >= 4.2 ? "Very good" : r >= 3.8 ? "Good" : "Okay";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* */ } }, [trip]);
  const loadStatus = () => authFetch("/status").then(r => r.json()).then(setStatus).catch(() => setStatus({ configured: false }));
  useEffect(() => { loadStatus(); }, []);

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

  const conv = (rupees: number) => (cc === "INR" ? rupees : roe ? rupees / roe : NaN);
  const fmtCc = (rupees: number) => { if (cc === "INR") return ""; const v = conv(rupees); return isNaN(v) ? "" : `${SYMBOL[cc] || cc + " "}${Math.round(v).toLocaleString("en-IN")}`; };

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

  // all prices for a hotel (supplier rates + every site), cheapest first
  const deals = (h: Hotel) => [
    ...([["Ottila", h.ottila], ["TBO", h.tbo], [h.otherSource || "Other", h.other]] as [string, string][])
      .filter(([, v]) => num(v) > 0).map(([s, v]) => ({ source: s, rupees: num(v), mine: true, free: !!h.cancel, link: undefined as string | undefined })),
    ...(h.online?.prices || []).map(p => ({ source: p.source, rupees: p.total, mine: false, free: p.free_cancellation, link: p.link })),
  ].sort((a, b) => a.rupees - b.rupees);
  const bestOf = (h: Hotel) => deals(h)[0]?.rupees ?? h.fromPrice;

  // ── Searching ──────────────────────────────────────────────────────────────
  const key = (c: City, h: Hotel) => `${h.name}|${c.name}|${c.checkIn}|${c.checkOut}|${JSON.stringify(rooms)}`;
  const compare = async (only?: City, force = false) => {
    setMsg(null);
    const cities = only ? [only] : trip.cities;
    const bad = cities.find(c => c.hotels.length && !nightsOf(c));
    if (bad) return setMsg({ kind: "err", text: `Check the dates for ${bad.name || "a city"}.` });
    const jobs: { c: City; h: Hotel }[] = [];
    for (const c of cities) for (const h of c.hotels) if (h.name.trim() && (force || h.searchedFor !== key(c, h))) jobs.push({ c, h });
    if (!jobs.length) return setMsg({ kind: "ok", text: "All prices are up to date. Use Refresh to search again." });
    setBusy(true);
    const work = async () => {
      for (let j = jobs.shift(); j; j = jobs.shift()) {
        const { c, h } = j;
        setHotel(c.id, h.id, { loading: true, error: undefined });
        try {
          const r: Online = await (await authFetch("/search", { hotel: h.name, city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, currency: "INR", property_token: h.token, rooms: apiRooms })).json();
          setHotel(c.id, h.id, { loading: false, online: r, searchedFor: key(c, h), image: h.image || r.image, rating: h.rating ?? r.rating, reviews: h.reviews ?? r.reviews, stars: h.stars ?? r.stars });
        } catch (e: any) { setHotel(c.id, h.id, { loading: false, error: e.message }); }
      }
    };
    await Promise.all([work(), work(), work()]);
    setBusy(false); loadStatus();
  };

  const findHotels = async (c: City) => {
    setMsg(null);
    if (!c.name || !nightsOf(c)) return setMsg({ kind: "err", text: "Enter the city and dates first." });
    setCity(c.id, { finding: true });
    try {
      const r = await (await authFetch("/discover", { city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, stars: c.stars || null, currency: "INR", limit: 12, rooms: apiRooms })).json();
      const have = new Set(c.hotels.map(h => h.name.toLowerCase()));
      const add = (r.hotels || []).filter((x: any) => x.name && !have.has(x.name.toLowerCase())).map((x: any) =>
        newHotel({ name: x.name, token: x.property_token, image: x.image, stars: x.stars, rating: x.rating, reviews: x.reviews, fromPrice: x.lowest_total }));
      setCity(c.id, { finding: false, hotels: [...c.hotels, ...add] });
      if (!add.length) setMsg({ kind: "err", text: "No new hotels found for that search." });
      loadStatus();
    } catch (e: any) { setCity(c.id, { finding: false }); setMsg({ kind: "err", text: e.message }); }
  };

  // ── Sorting like Skyscanner (Best / Cheapest / Top rated) ──────────────────
  const sorted = (c: City, by: SortKey) => {
    const hs = c.hotels.filter(h => h.name.trim());
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
    const sections = trip.cities.filter(c => c.hotels.some(h => h.name.trim())).map(c => {
      const rows: any[] = [];
      for (const h of sorted(c, "cheapest")) {
        const online = h.online?.prices || [];
        const bcom = online.find(p => /booking\.com/i.test(p.source));
        const cmpP = bcom || online[0];
        const compare = cmpP ? { source: bcom ? "B.com" : cmpP.source, currency: "INR", amount: cmpP.total, meal: h.meal, cancel: cmpP.free_cancellation ? "Free cxl" : undefined } : undefined;
        const remark = online.length ? online.slice(0, 6).map(p => `${p.source} ${inr(p.total)}`).join(" · ") : undefined;
        const desc = `${h.name}${h.stars ? ` ${h.stars}*` : ""} x${nRooms} ${h.room || "Room"}`;
        const ds = deals(h);
        if (!ds.length) { rows.push({ bid: h.label || undefined, description: desc, source: "", meal: h.meal, notes: "No price" }); continue; }
        const mine = ds.filter(d => d.mine);
        const main = mine.length ? mine : [ds[0]];
        main.forEach((d, i) => rows.push({ bid: h.label || undefined, description: desc, source: d.source, currency: "INR", amount: d.rupees, meal: h.meal,
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
      setMsg({ kind: "ok", text: "Excel downloaded in the standard costing layout." });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); } finally { setBusy(false); }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const price = (rupees: number | undefined, nights: number, big = false) => {
    if (!rupees) return <span style={{ color: MUTED }}>—</span>;
    const r = trip.perNight ? rupees / nights : rupees;
    return (
      <div style={{ textAlign: "right", lineHeight: 1.15 }}>
        <div style={{ fontSize: big ? 24 : 16, fontWeight: 800, color: TEXT }}>{inr(r)}</div>
        {fmtCc(r) && <div style={{ fontSize: big ? 13 : 11.5, color: MUTED, fontWeight: 600 }}>{fmtCc(r)}</div>}
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
          {status?.configured && (
            <span style={{ ...pill(BG, MUTED), boxShadow: SHADOW_IN, fontSize: 12, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <KeyRound style={{ width: 13, height: 13, color: ACCENT }} /> {status.searches_left ?? "?"} searches left{status.keys && status.keys > 1 ? ` · key ${status.active_key ?? "-"} of ${status.keys}` : ""}
            </span>
          )}
          <button style={btn()} onClick={() => { if (confirm("Start a new trip? This clears the current one.")) setTrip({ ...EMPTY, currency: trip.currency, roe: trip.roe, roeNote: trip.roeNote, cities: [newCity()] }); }}><Trash2 style={{ width: 14, height: 14 }} /> New trip</button>
        </div>

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
                        <Stepper value={r.adults} min={1} max={6} onChange={n => setRoom(i, { adults: n })} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: TEXT, fontSize: 13.5, fontWeight: 600 }}>Children</span>
                        <Stepper value={r.ages.length} min={0} max={4} onChange={n => setChildren(i, n)} />
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
          const list = sorted(c, c.sort);
          const tabs: { k: SortKey; label: string }[] = [{ k: "best", label: "Best" }, { k: "cheapest", label: "Cheapest" }, { k: "rated", label: "Top rated" }];
          const top = (k: SortKey) => sorted(c, k)[0];
          const cheapestId = top("cheapest")?.id, bestId = top("best")?.id, ratedId = top("rated")?.id;
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
                  <button style={{ ...btn(), background: "rgba(255,255,255,0.96)", color: "#5B6FD0", boxShadow: "none", flex: 1, justifyContent: "center" }} disabled={c.finding} onClick={() => findHotels(c)} title="Uses 1 search">
                    {c.finding ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <MapPin style={{ width: 15, height: 15 }} />} Find hotels
                  </button>
                  {trip.cities.length > 1 && <button title="Remove city" style={{ ...btn(), background: "transparent", color: "#fff", boxShadow: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "10px 11px" }} onClick={() => setT({ cities: trip.cities.filter(x => x.id !== c.id) })}><X style={{ width: 15, height: 15 }} /></button>}
                </div>
                <button style={{ ...btn(), background: "#3F4FA8", color: "#fff", boxShadow: "none", justifyContent: "center" }} disabled={busy} onClick={() => compare(c)}><Search style={{ width: 15, height: 15 }} /> Compare prices</button>
              </div>

              {/* Add hotel by name */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input style={{ ...inp, maxWidth: 420, flex: 1, minWidth: 200 }} value={c.newName || ""} placeholder="Add a hotel by name (press Enter)…"
                  onChange={e => setCity(c.id, { newName: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter" && (c.newName || "").trim()) setCity(c.id, { hotels: [...c.hotels, newHotel({ name: c.newName!.trim() })], newName: "" }); }} />
                <button style={btn()} onClick={() => (c.newName || "").trim() && setCity(c.id, { hotels: [...c.hotels, newHotel({ name: c.newName!.trim() })], newName: "" })}><Plus style={{ width: 14, height: 14 }} /> Add</button>
                <div style={{ flex: 1 }} />
                <div style={{ display: "inline-flex", borderRadius: 12, boxShadow: SHADOW_IN, padding: 4, gap: 4 }}>
                  {[false, true].map(pn => (
                    <button key={String(pn)} onClick={() => setT({ perNight: pn })}
                      style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 700, border: "none", borderRadius: 9, cursor: "pointer", background: trip.perNight === pn ? GRAD : "transparent", color: trip.perNight === pn ? "#fff" : TEXT }}>
                      {pn ? "Per night" : `Total stay (${n}N${nRooms > 1 ? `, ${nRooms} rooms` : ""})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort tabs */}
              {list.length > 0 && (
                <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", padding: 6, gap: 6 }}>
                  {tabs.map(t => {
                    const h = top(t.k); const active = c.sort === t.k; const p = h ? bestOf(h) : undefined;
                    return (
                      <button key={t.k} onClick={() => setCity(c.id, { sort: t.k })}
                        style={{ padding: "10px 14px", textAlign: "left", border: "none", borderRadius: 13, background: active ? GRAD : "transparent", boxShadow: active ? SHADOW_SM : "none", cursor: "pointer" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: active ? "#fff" : TEXT }}>{t.label}</div>
                        <div style={{ fontSize: 13, color: active ? "rgba(255,255,255,0.85)" : MUTED }}>{p ? `${inr(trip.perNight ? p / n : p)}${fmtCc(p) ? " · " + fmtCc(trip.perNight ? p / n : p) : ""}` : "—"}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {list.length === 0 && (
                <div style={{ ...card, padding: 26, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  <BedDouble style={{ width: 28, height: 28, margin: "0 auto 6px", color: ACCENT }} />
                  Enter the city and dates, then <b>Find hotels</b> or add hotels by name.
                </div>
              )}

              {/* Result cards */}
              {list.map(h => {
                const ds = deals(h); const best = ds[0]; const shown = h.open ? ds : ds.slice(0, 3);
                const link = (d: { source: string; link?: string }) => d.link || `https://www.google.com/search?q=${encodeURIComponent(`${d.source} ${h.name} ${c.name}`)}`;
                return (
                  <div key={h.id} style={{ ...card, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 240px", minHeight: 150 }} className="max-md:!grid-cols-1">
                      {/* image */}
                      <div style={{ position: "relative", padding: 10 }}>
                        {h.image ? <img src={h.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 140, borderRadius: 14 }} />
                          : <div style={{ height: "100%", minHeight: 140, borderRadius: 14, boxShadow: SHADOW_IN, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><BedDouble style={{ width: 34, height: 34 }} /></div>}
                        <div style={{ position: "absolute", top: 18, left: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                          {h.id === cheapestId && bestOf(h) && <span style={pill(GREEN)}>Cheapest</span>}
                          {h.id === bestId && bestOf(h) && <span style={pill(ACCENT)}>Best</span>}
                          {h.id === ratedId && h.rating && <span style={pill(PURPLE)}>Top rated</span>}
                        </div>
                      </div>

                      {/* details */}
                      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{h.name}</span>
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
                        {h.loading && <div style={{ fontSize: 12.5, color: ACCENT, display: "flex", gap: 5, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Checking all booking sites{nRooms > 1 ? ` for ${nRooms} rooms` : ""}…</div>}
                        {h.error && <div style={{ fontSize: 12.5, color: ERR }}>{h.error}</div>}
                        {h.online && !h.online.found && <div style={{ fontSize: 12.5, color: WARN }}>Not found online{h.online.suggestions?.length ? ` — try: ${h.online.suggestions.slice(0, 3).join(", ")}` : ""}</div>}
                        {!h.online && !h.loading && h.fromPrice && <div style={{ fontSize: 12.5, color: MUTED }}>From {inr(h.fromPrice)} · click <b>Compare prices</b> to see every site</div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", alignItems: "center", fontSize: 12.5 }}>
                          <input style={{ ...inp, width: 180, padding: "7px 9px", fontSize: 12.5 }} value={h.room} placeholder="Room type (for Excel)" onChange={e => setHotel(c.id, h.id, { room: e.target.value })} />
                          <select style={{ ...inp, width: 66, padding: "7px 6px", fontSize: 12.5 }} value={h.meal} onChange={e => setHotel(c.id, h.id, { meal: e.target.value })}>{MEALS.map(m => <option key={m}>{m}</option>)}</select>
                          <select style={{ ...inp, width: 86, padding: "7px 6px", fontSize: 12.5 }} value={h.label} onChange={e => setHotel(c.id, h.id, { label: e.target.value })}>{LABELS.map(l => <option key={l} value={l}>{l || "label"}</option>)}</select>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TEXT, cursor: "pointer" }}>
                            <input type="checkbox" checked={h.inPkg} onChange={e => setHotel(c.id, h.id, { inPkg: e.target.checked })} style={{ accentColor: ACCENT }} /> In package
                          </label>
                          <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: ACCENT }} onClick={() => setHotel(c.id, h.id, { showRates: !h.showRates })}>
                            <Plus style={{ width: 12, height: 12 }} /> Ottila / TBO / DMC rate
                          </button>
                        </div>
                      </div>

                      {/* best price */}
                      <div style={{ margin: 10, borderRadius: 14, boxShadow: SHADOW_IN, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 6 }}>
                        {best ? (<>
                          <div style={{ fontSize: 12, color: MUTED }}>{ds.length} deal{ds.length > 1 ? "s" : ""} · cheapest on</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{best.source}{best.mine ? " (your rate)" : ""}</div>
                          {price(best.rupees, n, true)}
                          <div style={{ fontSize: 11.5, color: MUTED, textAlign: "right" }}>{trip.perNight ? "per night" : `total for ${plural(n, "night", "nights")}`}{nRooms > 1 ? `, ${nRooms} rooms` : ""}{best.free ? " · free cancellation" : ""}</div>
                          {!best.mine && <a href={link(best)} target="_blank" rel="noreferrer" style={{ ...btn("primary"), textDecoration: "none" }}>View deal <ExternalLink style={{ width: 13, height: 13 }} /></a>}
                        </>) : h.fromPrice ? (<>
                          <div style={{ fontSize: 12, color: MUTED }}>from</div>{price(h.fromPrice, n, true)}
                        </>) : <div style={{ fontSize: 13, color: MUTED }}>No price yet</div>}
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

                    {/* all deals */}
                    {ds.length > 0 && (
                      <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {shown.map((d, i) => (
                          <div key={d.source + i} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto 120px", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: i === 0 ? TINT : "transparent", boxShadow: i === 0 ? "none" : SHADOW_IN }}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, background: d.mine ? GRAD : BG, boxShadow: d.mine ? "none" : SHADOW_SM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: d.mine ? "#fff" : ACCENT }}>{d.source[0]?.toUpperCase()}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                              {d.source}
                              {d.mine && <span style={{ ...pill(ACCENT), marginLeft: 8 }}>your rate</span>}
                              {i === 0 && <span style={{ ...pill(GREEN), marginLeft: 8 }}>cheapest</span>}
                              {i > 0 && best && <span style={{ marginLeft: 8, fontSize: 12, color: WARN, fontWeight: 600 }}>+{inr(trip.perNight ? (d.rupees - best.rupees) / n : d.rupees - best.rupees)}</span>}
                            </div>
                            <div style={{ fontSize: 12, color: d.free ? GREEN : MUTED, fontWeight: 600 }}>{d.free ? (d.mine && h.cancel ? `Free cxl till ${nice(h.cancel)}` : "Free cancellation") : ""}</div>
                            {price(d.rupees, n)}
                            {d.mine ? <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>supplier rate</span>
                              : <a href={link(d)} target="_blank" rel="noreferrer" style={{ ...btn(i === 0 ? "primary" : "ghost"), justifyContent: "center", padding: "7px 10px", fontSize: 12.5, textDecoration: "none" }}>View deal <ExternalLink style={{ width: 12, height: 12 }} /></a>}
                          </div>
                        ))}
                        {ds.length > 3 && (
                          <button onClick={() => setHotel(c.id, h.id, { open: !h.open })} style={{ width: "100%", padding: 9, border: "none", background: "transparent", color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}>
                            {h.open ? <>Show fewer deals <ChevronUp style={{ width: 14, height: 14 }} /></> : <>Show all {ds.length} deals <ChevronDown style={{ width: 14, height: 14 }} /></>}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Bottom actions */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btn()} onClick={() => setT({ cities: [...trip.cities, newCity()] })}><Plus style={{ width: 14, height: 14 }} /> Add city</button>
          <button style={btn("primary")} disabled={busy} onClick={() => compare()}>{busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Compare all cities</button>
          <button style={btn()} disabled={busy} onClick={() => compare(undefined, true)} title="Search every hotel again (uses searches)"><RefreshCw style={{ width: 14, height: 14 }} /> Refresh</button>
          <button style={{ ...btn(), color: GREEN }} disabled={busy} onClick={downloadExcel}><Download style={{ width: 15, height: 15 }} /> Download Excel</button>
          <span style={{ fontSize: 12, color: MUTED }}>Online prices are each site's cheapest room, added up for {roomSummary(rooms).toLowerCase()}. Repeating a search within 6 hours is free.</span>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.kind === "ok" ? GREEN : ERR, display: "flex", gap: 6, alignItems: "center" }}>{msg.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <AlertTriangle style={{ width: 15, height: 15 }} />} {msg.text}</div>}
      </div>
    </DashboardLayout>
  );
}
