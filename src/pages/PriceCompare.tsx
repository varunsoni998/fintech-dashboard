/**
 * PriceCompare.tsx — Skyscanner-style hotel price comparison for a trip.
 * Online prices from every booking site Google Hotels knows (backend /api/prices, SerpApi),
 * plus the team's own supplier rates (Ottila, TBO, DMC). Cheapest first, no markup.
 * "Download Excel" writes the standard CustomHolidays costing sheet.
 */
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import {
  Scale, Plus, X, Search, Loader2, Download, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
  Star, ExternalLink, ChevronDown, ChevronUp, BedDouble, MapPin, KeyRound,
} from "lucide-react";

const API = "https://fintech-dashboard-61vh.onrender.com/api/prices";
const STORE = "pc:trip:v2";
const MEALS = ["RO", "BB", "HB", "FB", "AI"];
const LABELS = ["", "base", "upg 1", "upg 2", "upg 3"];
const CCYS = ["USD", "EUR", "CHF", "GBP", "AED", "SGD", "THB", "INR"];
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", AED: "AED ", SGD: "S$", THB: "฿", INR: "₹" };

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
interface Trip { name: string; adults: number; rooms: string; currency: string; roe: string; gst: string; tcs: string; notes: string; perNight: boolean; cities: City[] }

const uid = () => Math.random().toString(36).slice(2, 9);
const newHotel = (p: Partial<Hotel> = {}): Hotel => ({ id: uid(), name: "", room: "", meal: "BB", label: "", inPkg: false, ottila: "", tbo: "", otherSource: "DMC", other: "", cancel: "", ...p });
const newCity = (): City => ({ id: uid(), name: "", checkIn: "", checkOut: "", stars: 5, hotels: [], sort: "cheapest" });
const EMPTY: Trip = { name: "", adults: 2, rooms: "1 Room (1 DBL)", currency: "USD", roe: "", gst: "5", tcs: "2", notes: "", perNight: false, cities: [newCity()] };

const nightsOf = (c: City) => { const a = Date.parse(c.checkIn), b = Date.parse(c.checkOut); return a && b && b > a ? Math.round((b - a) / 86400000) : 0; };
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] || "th");
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00"); return isNaN(+d) ? iso : `${ord(d.getDate())} ${d.toLocaleString("en", { month: "short" })}`; };
const num = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : v; };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
const ratingWord = (r?: number) => !r ? "" : r >= 4.7 ? "Exceptional" : r >= 4.5 ? "Excellent" : r >= 4.2 ? "Very good" : r >= 3.8 ? "Good" : "Okay";

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
  // ── Skyscanner-like palette ────────────────────────────────────────────────
  const NAVY = "#05203C", SKY = "#0062E3", TEAL = "#00A698";
  const PAGE = dark ? "#11131F" : "#EFF3F8";
  const CARD = dark ? "#1B1E2E" : "#FFFFFF";
  const LINE = dark ? "#2C3048" : "#E0E4E9";
  const TEXT = dark ? "#E6E8F2" : "#161616";
  const MUTED = dark ? "#9097B8" : "#626971";
  const SOFT = dark ? "#23273B" : "#F5F7FA";
  const card: React.CSSProperties = { background: CARD, borderRadius: 12, border: `1px solid ${LINE}` };
  const inp: React.CSSProperties = { background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 10px", fontSize: 14, color: TEXT, outline: "none", width: "100%" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: MUTED, display: "flex", flexDirection: "column", gap: 4 };
  const pill = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" });
  const btn = (kind: "primary" | "ghost" | "deal" = "ghost"): React.CSSProperties => ({
    background: kind === "primary" ? SKY : kind === "deal" ? TEAL : CARD, color: kind === "ghost" ? TEXT : "#fff",
    border: kind === "ghost" ? `1px solid ${LINE}` : "none", borderRadius: 8, padding: "9px 14px", fontSize: 13.5, fontWeight: 700,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  });

  const [trip, setTrip] = useState<Trip>(() => { try { const t = JSON.parse(localStorage.getItem(STORE) || ""); return t?.cities ? t : EMPTY; } catch { return EMPTY; } });
  const [status, setStatus] = useState<{ configured: boolean; keys?: number; searches_left?: number; active_key?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* */ } }, [trip]);
  const loadStatus = () => authFetch("/status").then(r => r.json()).then(setStatus).catch(() => setStatus({ configured: false }));
  useEffect(() => { loadStatus(); }, []);

  const cc = trip.currency, roe = num(trip.roe);
  const conv = (rupees: number) => (cc === "INR" ? rupees : roe ? rupees / roe : NaN);
  const fmtCc = (rupees: number) => { const v = conv(rupees); return isNaN(v) ? "" : `${SYMBOL[cc] || cc + " "}${Math.round(v).toLocaleString("en-IN")}`; };

  const setT = (p: Partial<Trip>) => setTrip(t => ({ ...t, ...p }));
  const setCity = (cid: string, p: Partial<City>) => setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id === cid ? { ...c, ...p } : c)) }));
  const setHotel = (cid: string, hid: string, p: Partial<Hotel>) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, ...p } : h)) })) }));

  // all prices for a hotel (supplier rates + every site), cheapest first
  const deals = (h: Hotel) => [
    ...([["Ottila", h.ottila], ["TBO", h.tbo], [h.otherSource || "Other", h.other]] as [string, string][])
      .filter(([, v]) => num(v) > 0).map(([s, v]) => ({ source: s, rupees: num(v), mine: true, free: !!h.cancel, link: undefined as string | undefined })),
    ...(h.online?.prices || []).map(p => ({ source: p.source, rupees: p.total, mine: false, free: p.free_cancellation, link: p.link })),
  ].sort((a, b) => a.rupees - b.rupees);
  const bestOf = (h: Hotel) => deals(h)[0]?.rupees ?? h.fromPrice;

  // ── Searching ──────────────────────────────────────────────────────────────
  const key = (c: City, h: Hotel) => `${h.name}|${c.name}|${c.checkIn}|${c.checkOut}|${trip.adults}`;
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
          const r: Online = await (await authFetch("/search", { hotel: h.name, city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: trip.adults, currency: "INR", property_token: h.token })).json();
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
      const r = await (await authFetch("/discover", { city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: trip.adults, stars: c.stars || null, currency: "INR", limit: 12 })).json();
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
    if (cc !== "INR" && !roe) return setMsg({ kind: "err", text: `Enter the ROE (₹ per 1 ${cc}) to download the Excel.` });
    const sections = trip.cities.filter(c => c.hotels.some(h => h.name.trim())).map(c => {
      const rows: any[] = [];
      for (const h of sorted(c, "cheapest")) {
        const online = h.online?.prices || [];
        const bcom = online.find(p => /booking\.com/i.test(p.source));
        const cmpP = bcom || online[0];
        const compare = cmpP ? { source: bcom ? "B.com" : cmpP.source, currency: "INR", amount: cmpP.total, meal: h.meal, cancel: cmpP.free_cancellation ? "Free cxl" : undefined } : undefined;
        const remark = online.length ? online.slice(0, 6).map(p => `${p.source} ${inr(p.total)}`).join(" · ") : undefined;
        const desc = `${h.name}${h.stars ? ` ${h.stars}*` : ""} x1 ${h.room || "Room"}`;
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
      trip: { name: trip.name || "Trip", rooms: trip.rooms, pax: `${trip.adults} Adults`, notes: trip.notes, costing_currency: cc,
              rates: cc === "INR" ? {} : { [cc]: roe }, markup: 0, gst: num(trip.gst) / 100, tcs: num(trip.tcs) / 100 },
      sections, packages: [{ key: "A", name: "Per couple" }],
    };
    try {
      setBusy(true);
      const blob = await (await authFetch("/excel", body)).blob();
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `${trip.name || "Trip"} costing.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMsg({ kind: "ok", text: "Excel downloaded in the standard costing layout." });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); } finally { setBusy(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, background: PAGE, borderRadius: 16, padding: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: SKY, display: "flex", alignItems: "center", justifyContent: "center" }}><Scale style={{ width: 21, height: 21, color: "#fff" }} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Price Compare</h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Compare every booking site plus your Ottila / TBO / DMC rates. Cheapest first, prices as quoted (no markup).</p>
          </div>
          {status?.configured && (
            <span style={{ ...pill(SOFT, MUTED), fontSize: 12, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${LINE}` }}>
              <KeyRound style={{ width: 13, height: 13 }} /> {status.searches_left ?? "?"} searches left{status.keys && status.keys > 1 ? ` · key ${status.active_key ?? "-"} of ${status.keys}` : ""}
            </span>
          )}
          <button style={btn()} onClick={() => { if (confirm("Start a new trip? This clears the current one.")) setTrip({ ...EMPTY, cities: [newCity()] }); }}><Trash2 style={{ width: 14, height: 14 }} /> New trip</button>
        </div>

        {status && !status.configured && (
          <div style={{ ...card, padding: 12, display: "flex", gap: 8, alignItems: "center", color: "#B25E09", fontSize: 13 }}>
            <AlertTriangle style={{ width: 16, height: 16 }} /> Online search is off: add SERPAPI_KEYS on the server (Render). Supplier rates and the Excel still work.
          </div>
        )}

        {/* Trip bar */}
        <div style={{ ...card, padding: 14, display: "grid", gridTemplateColumns: "2fr 0.6fr 1.3fr 0.8fr 0.9fr 0.6fr 0.6fr", gap: 10 }}>
          <label style={lbl}>Trip / client<input style={inp} value={trip.name} placeholder="Rashi Parekh - Australia" onChange={e => setT({ name: e.target.value })} /></label>
          <label style={lbl}>Adults<input style={inp} type="number" min={1} value={trip.adults} onChange={e => setT({ adults: Math.max(1, +e.target.value || 1) })} /></label>
          <label style={lbl}>Rooms<input style={inp} value={trip.rooms} onChange={e => setT({ rooms: e.target.value })} /></label>
          <label style={lbl}>Currency<select style={inp} value={cc} onChange={e => setT({ currency: e.target.value })}>{CCYS.map(c => <option key={c}>{c}</option>)}</select></label>
          <label style={lbl}>ROE (₹ per 1 {cc}){cc === "INR" ? <input style={inp} disabled value="—" /> : <input style={inp} value={trip.roe} placeholder="e.g. 94.3" onChange={e => setT({ roe: e.target.value })} />}</label>
          <label style={lbl}>GST %<input style={inp} value={trip.gst} onChange={e => setT({ gst: e.target.value })} /></label>
          <label style={lbl}>TCS %<input style={inp} value={trip.tcs} onChange={e => setT({ tcs: e.target.value })} /></label>
        </div>

        {trip.cities.map(c => {
          const n = nightsOf(c) || 1;
          const list = sorted(c, c.sort);
          const tabs: { k: SortKey; label: string }[] = [{ k: "best", label: "Best" }, { k: "cheapest", label: "Cheapest" }, { k: "rated", label: "Top rated" }];
          const top = (k: SortKey) => sorted(c, k)[0];
          const cheapestId = top("cheapest")?.id, bestId = top("best")?.id, ratedId = top("rated")?.id;
          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Search bar (Skyscanner navy) */}
              <div style={{ background: NAVY, borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr auto auto auto", gap: 8, alignItems: "end" }}>
                <label style={{ ...lbl, color: "#fff" }}>Where<input style={inp} value={c.name} placeholder="City, e.g. Melbourne" onChange={e => setCity(c.id, { name: e.target.value })} /></label>
                <label style={{ ...lbl, color: "#fff" }}>Check-in<input style={inp} type="date" value={c.checkIn} onChange={e => setCity(c.id, { checkIn: e.target.value })} /></label>
                <label style={{ ...lbl, color: "#fff" }}>Check-out<input style={inp} type="date" value={c.checkOut} onChange={e => setCity(c.id, { checkOut: e.target.value })} /></label>
                <label style={{ ...lbl, color: "#fff" }}>Stars<select style={inp} value={c.stars} onChange={e => setCity(c.id, { stars: +e.target.value })}>{[5, 4, 3, 0].map(s => <option key={s} value={s}>{s ? `${s}★` : "Any"}</option>)}</select></label>
                <button style={{ ...btn("ghost"), background: "#fff", color: NAVY, border: "none" }} disabled={c.finding} onClick={() => findHotels(c)} title="Uses 1 search">
                  {c.finding ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <MapPin style={{ width: 15, height: 15 }} />} Find hotels
                </button>
                <button style={btn("primary")} disabled={busy} onClick={() => compare(c)}><Search style={{ width: 15, height: 15 }} /> Compare prices</button>
                {trip.cities.length > 1 && <button style={{ ...btn(), background: "transparent", color: "#fff", border: "1px solid #ffffff55" }} onClick={() => setT({ cities: trip.cities.filter(x => x.id !== c.id) })}><X style={{ width: 15, height: 15 }} /></button>}
              </div>

              {/* Add hotel by name */}
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inp, maxWidth: 420 }} value={c.newName || ""} placeholder="Add a hotel by name (press Enter)…"
                  onChange={e => setCity(c.id, { newName: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter" && (c.newName || "").trim()) setCity(c.id, { hotels: [...c.hotels, newHotel({ name: c.newName!.trim() })], newName: "" }); }} />
                <button style={btn()} onClick={() => (c.newName || "").trim() && setCity(c.id, { hotels: [...c.hotels, newHotel({ name: c.newName!.trim() })], newName: "" })}><Plus style={{ width: 14, height: 14 }} /> Add</button>
                <div style={{ flex: 1 }} />
                <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                  {[false, true].map(pn => (
                    <button key={String(pn)} onClick={() => setT({ perNight: pn })}
                      style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", background: trip.perNight === pn ? SKY : CARD, color: trip.perNight === pn ? "#fff" : TEXT }}>
                      {pn ? "Per night" : `Total stay (${n}N)`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort tabs */}
              {list.length > 0 && (
                <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", overflow: "hidden" }}>
                  {tabs.map(t => {
                    const h = top(t.k); const active = c.sort === t.k; const p = h ? bestOf(h) : undefined;
                    return (
                      <button key={t.k} onClick={() => setCity(c.id, { sort: t.k })}
                        style={{ padding: "10px 14px", textAlign: "left", border: "none", borderBottom: `3px solid ${active ? SKY : "transparent"}`, background: active ? (dark ? "#1F2A44" : "#EAF2FF") : CARD, cursor: "pointer" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: active ? SKY : TEXT }}>{t.label}</div>
                        <div style={{ fontSize: 13, color: MUTED }}>{p ? `${inr(trip.perNight ? p / n : p)}${fmtCc(p) ? " · " + fmtCc(trip.perNight ? p / n : p) : ""}` : "—"}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {list.length === 0 && (
                <div style={{ ...card, padding: 24, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  <BedDouble style={{ width: 26, height: 26, margin: "0 auto 6px" }} />
                  Enter the city and dates, then <b>Find hotels</b> or add hotels by name.
                </div>
              )}

              {/* Result cards */}
              {list.map(h => {
                const ds = deals(h); const best = ds[0]; const shown = h.open ? ds : ds.slice(0, 3);
                const link = (d: { source: string; link?: string }) => d.link || `https://www.google.com/search?q=${encodeURIComponent(`${d.source} ${h.name} ${c.name}`)}`;
                return (
                  <div key={h.id} style={{ ...card, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 230px", minHeight: 150 }} className="max-md:!grid-cols-1">
                      {/* image */}
                      <div style={{ background: SOFT, position: "relative" }}>
                        {h.image ? <img src={h.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 150 }} />
                          : <div style={{ height: "100%", minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><BedDouble style={{ width: 34, height: 34 }} /></div>}
                        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {h.id === cheapestId && bestOf(h) && <span style={pill(TEAL)}>Cheapest</span>}
                          {h.id === bestId && bestOf(h) && <span style={pill(SKY)}>Best</span>}
                          {h.id === ratedId && h.rating && <span style={pill("#7B2FBE")}>Top rated</span>}
                        </div>
                      </div>

                      {/* details */}
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{h.name}</span>
                          {h.stars ? <span style={{ color: "#F5B400", display: "inline-flex" }}>{Array.from({ length: h.stars }).map((_, i) => <Star key={i} style={{ width: 13, height: 13, fill: "#F5B400" }} />)}</span> : null}
                          <div style={{ flex: 1 }} />
                          <button title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }} onClick={() => setCity(c.id, { hotels: c.hotels.filter(x => x.id !== h.id) })}><X style={{ width: 16, height: 16 }} /></button>
                        </div>
                        {h.rating ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                            <span style={{ ...pill(NAVY), fontSize: 12 }}>{h.rating.toFixed(1)}</span>
                            <b style={{ color: TEXT }}>{ratingWord(h.rating)}</b>
                            {h.reviews ? <span style={{ color: MUTED }}>{h.reviews.toLocaleString("en-IN")} reviews</span> : null}
                          </div>
                        ) : null}
                        {h.loading && <div style={{ fontSize: 12.5, color: SKY, display: "flex", gap: 5, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Checking all booking sites…</div>}
                        {h.error && <div style={{ fontSize: 12.5, color: "#D1435B" }}>{h.error}</div>}
                        {h.online && !h.online.found && <div style={{ fontSize: 12.5, color: "#B25E09" }}>Not found online{h.online.suggestions?.length ? ` — try: ${h.online.suggestions.slice(0, 3).join(", ")}` : ""}</div>}
                        {!h.online && !h.loading && h.fromPrice && <div style={{ fontSize: 12.5, color: MUTED }}>From {inr(h.fromPrice)} · click <b>Compare prices</b> to see every site</div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", alignItems: "center", fontSize: 12.5 }}>
                          <input style={{ ...inp, width: 180, padding: "6px 8px", fontSize: 12.5 }} value={h.room} placeholder="Room type (for Excel)" onChange={e => setHotel(c.id, h.id, { room: e.target.value })} />
                          <select style={{ ...inp, width: 64, padding: "6px 6px", fontSize: 12.5 }} value={h.meal} onChange={e => setHotel(c.id, h.id, { meal: e.target.value })}>{MEALS.map(m => <option key={m}>{m}</option>)}</select>
                          <select style={{ ...inp, width: 84, padding: "6px 6px", fontSize: 12.5 }} value={h.label} onChange={e => setHotel(c.id, h.id, { label: e.target.value })}>{LABELS.map(l => <option key={l} value={l}>{l || "label"}</option>)}</select>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TEXT, cursor: "pointer" }}>
                            <input type="checkbox" checked={h.inPkg} onChange={e => setHotel(c.id, h.id, { inPkg: e.target.checked })} /> In package
                          </label>
                          <button style={{ ...btn(), padding: "5px 10px", fontSize: 12 }} onClick={() => setHotel(c.id, h.id, { showRates: !h.showRates })}>
                            <Plus style={{ width: 12, height: 12 }} /> Ottila / TBO / DMC rate
                          </button>
                        </div>
                      </div>

                      {/* best price */}
                      <div style={{ borderLeft: `1px solid ${LINE}`, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 6, background: SOFT }}>
                        {best ? (<>
                          <div style={{ fontSize: 12, color: MUTED }}>{ds.length} deal{ds.length > 1 ? "s" : ""} · cheapest on</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{best.source}{best.mine ? " (your rate)" : ""}</div>
                          {price(best.rupees, n, true)}
                          <div style={{ fontSize: 11.5, color: MUTED }}>{trip.perNight ? "per night" : `total for ${n} night${n > 1 ? "s" : ""}`}{best.free ? " · free cancellation" : ""}</div>
                          {!best.mine && <a href={link(best)} target="_blank" rel="noreferrer" style={{ ...btn("deal"), textDecoration: "none" }}>View deal <ExternalLink style={{ width: 13, height: 13 }} /></a>}
                        </>) : h.fromPrice ? (<>
                          <div style={{ fontSize: 12, color: MUTED }}>from</div>{price(h.fromPrice, n, true)}
                        </>) : <div style={{ fontSize: 13, color: MUTED }}>No price yet</div>}
                      </div>
                    </div>

                    {/* supplier rates */}
                    {h.showRates && (
                      <div style={{ borderTop: `1px solid ${LINE}`, padding: 12, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, background: SOFT }}>
                        <label style={lbl}>Ottila ₹ (total)<input style={inp} value={h.ottila} onChange={e => setHotel(c.id, h.id, { ottila: e.target.value })} /></label>
                        <label style={lbl}>TBO ₹ (total)<input style={inp} value={h.tbo} onChange={e => setHotel(c.id, h.id, { tbo: e.target.value })} /></label>
                        <label style={lbl}>Other source<input style={inp} value={h.otherSource} onChange={e => setHotel(c.id, h.id, { otherSource: e.target.value })} /></label>
                        <label style={lbl}>Other ₹ (total)<input style={inp} value={h.other} onChange={e => setHotel(c.id, h.id, { other: e.target.value })} /></label>
                        <label style={lbl}>Free cancellation until<input style={inp} type="date" value={h.cancel} onChange={e => setHotel(c.id, h.id, { cancel: e.target.value })} /></label>
                      </div>
                    )}

                    {/* all deals */}
                    {ds.length > 0 && (
                      <div style={{ borderTop: `1px solid ${LINE}` }}>
                        {shown.map((d, i) => (
                          <div key={d.source + i} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto 120px", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: `1px solid ${LINE}`, background: i === 0 ? (dark ? "#173A36" : "#E7F7F5") : "transparent" }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: d.mine ? SKY : SOFT, border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: d.mine ? "#fff" : TEXT }}>{d.source[0]?.toUpperCase()}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                              {d.source}
                              {d.mine && <span style={{ ...pill(SKY), marginLeft: 8 }}>your rate</span>}
                              {i === 0 && <span style={{ ...pill(TEAL), marginLeft: 8 }}>cheapest</span>}
                              {i > 0 && best && <span style={{ marginLeft: 8, fontSize: 12, color: "#B25E09", fontWeight: 600 }}>+{inr(trip.perNight ? (d.rupees - best.rupees) / n : d.rupees - best.rupees)}</span>}
                            </div>
                            <div style={{ fontSize: 12, color: d.free ? "#0B8A43" : MUTED, fontWeight: 600 }}>{d.free ? (d.mine && h.cancel ? `Free cxl till ${nice(h.cancel)}` : "Free cancellation") : ""}</div>
                            {price(d.rupees, n)}
                            {d.mine ? <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>supplier rate</span>
                              : <a href={link(d)} target="_blank" rel="noreferrer" style={{ ...btn(i === 0 ? "deal" : "ghost"), justifyContent: "center", padding: "7px 10px", fontSize: 12.5, textDecoration: "none" }}>View deal <ExternalLink style={{ width: 12, height: 12 }} /></a>}
                          </div>
                        ))}
                        {ds.length > 3 && (
                          <button onClick={() => setHotel(c.id, h.id, { open: !h.open })} style={{ width: "100%", padding: 10, border: "none", background: CARD, color: SKY, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}>
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btn()} onClick={() => setT({ cities: [...trip.cities, newCity()] })}><Plus style={{ width: 14, height: 14 }} /> Add city</button>
          <button style={btn("primary")} disabled={busy} onClick={() => compare()}>{busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Compare all cities</button>
          <button style={btn()} disabled={busy} onClick={() => compare(undefined, true)} title="Search every hotel again (uses searches)"><RefreshCw style={{ width: 14, height: 14 }} /> Refresh</button>
          <button style={btn("deal")} disabled={busy} onClick={downloadExcel}><Download style={{ width: 15, height: 15 }} /> Download Excel</button>
          <span style={{ fontSize: 12, color: MUTED }}>Online prices are each site's cheapest room for 1 room, incl. taxes where shown. Repeating a search within 6 hours is free.</span>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.kind === "ok" ? "#0B8A43" : "#D1435B", display: "flex", gap: 6, alignItems: "center" }}>{msg.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <AlertTriangle style={{ width: 15, height: 15 }} />} {msg.text}</div>}
      </div>
    </DashboardLayout>
  );
}
