/**
 * PriceCompare.tsx — compare hotel prices for a trip across every booking site
 * (Google Hotels data via the backend /api/prices) plus the team's own supplier
 * rates (Ottila, TBO, DMC…), then download the costing sheet in the standard layout.
 */
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import {
  Scale, Plus, X, Search, Loader2, Download, Sparkles, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
} from "lucide-react";

const API = "https://fintech-dashboard-61vh.onrender.com/api/prices";
const STORE = "pc:trip:v1";
const MEALS = ["RO", "BB", "HB", "FB", "AI"];
const LABELS = ["", "base", "upg 1", "upg 2", "upg 3"];
const CCYS = ["USD", "EUR", "CHF", "GBP", "AED", "INR"];

interface OnlinePrice { source: string; total: number; per_night: number; free_cancellation: boolean; link?: string }
interface Online { found: boolean; name?: string; stars?: number; prices: OnlinePrice[]; suggestions?: string[] }
interface Hotel {
  id: string; name: string; room: string; meal: string; label: string; inPkg: boolean;
  ottila: string; tbo: string; otherSource: string; other: string; cancel: string;
  online?: Online; loading?: boolean; error?: string; searchedFor?: string;
}
interface City { id: string; name: string; checkIn: string; checkOut: string; hotels: Hotel[]; suggest?: { name: string; stars?: number; lowest_total?: number }[] }
interface Trip { name: string; adults: number; rooms: string; currency: string; roe: string; markup: string; gst: string; tcs: string; notes: string; cities: City[] }

const uid = () => Math.random().toString(36).slice(2, 9);
const newHotel = (name = ""): Hotel => ({ id: uid(), name, room: "", meal: "BB", label: "", inPkg: false, ottila: "", tbo: "", otherSource: "DMC", other: "", cancel: "" });
const newCity = (): City => ({ id: uid(), name: "", checkIn: "", checkOut: "", hotels: [newHotel()] });
const EMPTY: Trip = { name: "", adults: 2, rooms: "1 Room (1 DBL)", currency: "USD", roe: "", markup: "15", gst: "5", tcs: "2", notes: "", cities: [newCity()] };

const nightsOf = (c: City) => {
  const a = Date.parse(c.checkIn), b = Date.parse(c.checkOut);
  return a && b && b > a ? Math.round((b - a) / 86400000) : 0;
};
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] || "th");
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00"); return isNaN(+d) ? iso : `${ord(d.getDate())} ${d.toLocaleString("en", { month: "short" })}`; };
const num = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : v; };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");

async function authFetch(path: string, body?: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).detail || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

export default function PriceCompare() {
  const { dark } = useDarkMode();
  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_OUT = dark ? "5px 5px 12px #0D0D1A, -5px -5px 12px #272744" : "5px 5px 12px #C4C4D4, -5px -5px 12px #FFFFFF";
  const SHADOW_IN = dark ? "inset 3px 3px 7px #0D0D1A, inset -3px -3px 7px #272744" : "inset 3px 3px 7px #C4C4D4, inset -3px -3px 7px #FFFFFF";
  const TEXT = dark ? "#D0D0F0" : "#3A3A5A";
  const MUTED = dark ? "#7070A0" : "#9090A8";
  const ACCENT = "#6B7FD4";
  const GOOD = dark ? "#1E4D36" : "#C8E6C9";
  const card: React.CSSProperties = { background: BG, boxShadow: SHADOW_OUT, borderRadius: 20, padding: 18 };
  const inp: React.CSSProperties = { background: BG, boxShadow: SHADOW_IN, border: "none", borderRadius: 10, padding: "7px 9px", fontSize: 13, color: TEXT, outline: "none", width: "100%" };
  const btn = (primary = false): React.CSSProperties => ({ background: primary ? "linear-gradient(135deg,#7B8FE0,#5B6FD0)" : BG, color: primary ? "#fff" : TEXT, boxShadow: SHADOW_OUT, border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", display: "flex", flexDirection: "column", gap: 5 };

  const [trip, setTrip] = useState<Trip>(() => { try { return JSON.parse(localStorage.getItem(STORE) || "") || EMPTY; } catch { return EMPTY; } });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(0);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* ignore */ } }, [trip]);
  useEffect(() => { authFetch("/status").then(r => r.json()).then(d => setConfigured(!!d.configured)).catch(() => setConfigured(false)); }, []);

  const roe = num(trip.roe);
  const cc = trip.currency;
  // ₹ → costing currency (INR prices shown as-is when costing currency is INR)
  const toCost = (rupees: number) => (cc === "INR" ? rupees : roe ? rupees / roe : NaN);
  const fmtCost = (v: number) => (isNaN(v) ? "—" : (cc === "INR" ? inr(v) : `${cc === "USD" ? "$" : cc + " "}${Math.round(v).toLocaleString("en-IN")}`));

  const setT = (patch: Partial<Trip>) => setTrip(t => ({ ...t, ...patch }));
  const setCity = (cid: string, patch: Partial<City>) => setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id === cid ? { ...c, ...patch } : c)) }));
  const setHotel = (cid: string, hid: string, patch: Partial<Hotel>) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, ...patch } : h)) })) }));

  // ── Online search ──────────────────────────────────────────────────────────
  const searchKey = (c: City, h: Hotel) => `${h.name}|${c.name}|${c.checkIn}|${c.checkOut}|${trip.adults}`;
  const runSearch = async (force = false) => {
    setMsg(null);
    const jobs: { c: City; h: Hotel }[] = [];
    for (const c of trip.cities) for (const h of c.hotels)
      if (h.name.trim() && c.checkIn && c.checkOut && (force || h.searchedFor !== searchKey(c, h))) jobs.push({ c, h });
    if (!jobs.length) return setMsg({ kind: "ok", text: "Everything is already up to date. Use Refresh to search again." });
    const bad = trip.cities.find(c => c.hotels.some(h => h.name.trim()) && !nightsOf(c));
    if (bad) return setMsg({ kind: "err", text: `Check the dates for ${bad.name || "a city"}.` });
    setBusy(true);
    let n = 0;
    const work = async () => {
      for (let j = jobs.shift(); j; j = jobs.shift()) {
        const { c, h } = j;
        setHotel(c.id, h.id, { loading: true, error: undefined });
        try {
          const r = await (await authFetch("/search", { hotel: h.name, city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: trip.adults, currency: "INR" })).json();
          n += r.searches_used || 0;
          setHotel(c.id, h.id, { loading: false, online: r, searchedFor: searchKey(c, h) });
        } catch (e: any) {
          setHotel(c.id, h.id, { loading: false, error: e.message });
        }
      }
    };
    await Promise.all([work(), work(), work()]);
    setUsed(u => u + n);
    setBusy(false);
  };

  const suggest = async (c: City) => {
    if (!c.name || !nightsOf(c)) return setMsg({ kind: "err", text: "Fill in the city name and dates first." });
    try {
      const r = await (await authFetch("/discover", { city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: trip.adults, stars: 5, currency: "INR" })).json();
      setUsed(u => u + 1);
      setCity(c.id, { suggest: r.hotels });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  };

  // ── Comparison helpers ─────────────────────────────────────────────────────
  const supplierPrices = (h: Hotel) => ([
    ["Ottila", h.ottila], ["TBO", h.tbo], [h.otherSource || "Other", h.other],
  ] as [string, string][]).filter(([, v]) => num(v) > 0).map(([s, v]) => ({ source: s, rupees: num(v) }));

  const sourcesByCity = useMemo(() => trip.cities.map(c => {
    const set = new Set<string>();
    c.hotels.forEach(h => h.online?.prices?.forEach(p => set.add(p.source)));
    const list = [...set];
    list.sort((a, b) => (a === "Booking.com" ? -1 : b === "Booking.com" ? 1 : a.localeCompare(b)));
    return list.slice(0, 8);
  }), [trip.cities]);

  // ── Excel ──────────────────────────────────────────────────────────────────
  const downloadExcel = async () => {
    setMsg(null);
    if (cc !== "INR" && !roe) return setMsg({ kind: "err", text: `Enter the ROE (₹ per 1 ${cc}) first.` });
    const sections = trip.cities.filter(c => c.hotels.some(h => h.name.trim())).map(c => {
      const rows: any[] = [];
      for (const h of c.hotels.filter(h => h.name.trim())) {
        const online = h.online?.prices || [];
        const bcom = online.find(p => /booking\.com/i.test(p.source));
        const bestOther = online.find(p => !/booking\.com/i.test(p.source));
        const cmp = bcom || bestOther;
        const compare = cmp ? { source: bcom ? "B.com" : cmp.source, currency: "INR", amount: cmp.total, meal: h.meal, cancel: cmp.free_cancellation ? "Free cxl" : undefined } : undefined;
        const remark = online.length ? online.slice(0, 6).map(p => `${p.source} ${inr(p.total)}`).join(" · ") : undefined;
        const stars = h.online?.stars ? ` ${h.online.stars}*` : "";
        const desc = `${h.name}${stars} x1 ${h.room || "Room"}`.trim();
        const sup = supplierPrices(h).sort((a, b) => a.rupees - b.rupees);
        if (sup.length) {
          sup.forEach((s, i) => rows.push({ bid: h.label || undefined, description: desc, source: s.source, currency: "INR", amount: s.rupees,
            meal: h.meal, cancel: h.cancel || undefined, pkg: h.inPkg && i === 0 ? ["A"] : [], compare, remark: i === 0 ? remark : undefined }));
        } else if (online.length) {
          const best = online[0];
          rows.push({ bid: h.label || undefined, description: desc, source: best.source, currency: "INR", amount: best.total, meal: h.meal,
            cancel: best.free_cancellation ? "Free cxl" : undefined, pkg: h.inPkg ? ["A"] : [], compare: bcom && bcom !== best ? compare : undefined, remark });
        } else {
          rows.push({ bid: h.label || undefined, description: desc, source: "", meal: h.meal, notes: "No price", remark: h.online && !h.online.found ? "Not found online" : undefined });
        }
      }
      return { title: `${c.name} ${nice(c.checkIn)} to ${nice(c.checkOut)} ${nightsOf(c)}N`, rows };
    });
    const body = {
      sheet_name: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", ""),
      trip: { name: trip.name || "Trip", rooms: trip.rooms, pax: `${trip.adults} Adults`, notes: trip.notes,
              costing_currency: cc, rates: cc === "INR" ? {} : { [cc]: roe }, markup: num(trip.markup) / 100, gst: num(trip.gst) / 100, tcs: num(trip.tcs) / 100 },
      sections, packages: [{ key: "A", name: "Per couple" }],
    };
    try {
      setBusy(true);
      const blob = await (await authFetch("/excel", body)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${trip.name || "Trip"} costing.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMsg({ kind: "ok", text: "Excel downloaded in the standard costing layout." });
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(false); }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: MUTED, textAlign: "left", padding: "6px 6px", whiteSpace: "nowrap", textTransform: "uppercase" };
  const td: React.CSSProperties = { padding: "5px 6px", fontSize: 12.5, color: TEXT, verticalAlign: "top" };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(135deg,#7B8FE0,#5B6FD0)", boxShadow: SHADOW_OUT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Scale style={{ width: 22, height: 22, color: "#fff" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Price Compare</h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>One click checks Booking.com, Agoda, Expedia, Trip.com, hotel websites and more. Add Ottila / TBO / DMC rates and download the costing sheet.</p>
          </div>
          <button style={btn()} onClick={() => { if (confirm("Start a new trip? This clears the current one.")) setTrip({ ...EMPTY, cities: [newCity()] }); }}>
            <Trash2 style={{ width: 14, height: 14 }} /> New trip
          </button>
        </div>

        {configured === false && (
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", color: "#D48A2E", fontSize: 13 }}>
            <AlertTriangle style={{ width: 16, height: 16 }} /> Online price search isn't switched on yet: the SERPAPI_KEY setting needs adding on the server (Render). You can still enter supplier prices and download the Excel.
          </div>
        )}

        {/* Trip details */}
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1.3fr 0.8fr 0.8fr 0.7fr 0.6fr 0.6fr", gap: 10 }}>
            <label style={label}>Trip name<input style={inp} value={trip.name} placeholder="Mr Shah - Bali" onChange={e => setT({ name: e.target.value })} /></label>
            <label style={label}>Adults<input style={inp} type="number" min={1} value={trip.adults} onChange={e => setT({ adults: Math.max(1, +e.target.value || 1) })} /></label>
            <label style={label}>Rooms<input style={inp} value={trip.rooms} onChange={e => setT({ rooms: e.target.value })} /></label>
            <label style={label}>Costing ccy<select style={inp} value={cc} onChange={e => setT({ currency: e.target.value })}>{CCYS.map(c => <option key={c}>{c}</option>)}</select></label>
            <label style={label}>ROE (₹ per 1){cc === "INR" ? <input style={inp} disabled value="—" /> : <input style={inp} value={trip.roe} placeholder="94.3" onChange={e => setT({ roe: e.target.value })} />}</label>
            <label style={label}>Markup %<input style={inp} value={trip.markup} onChange={e => setT({ markup: e.target.value })} /></label>
            <label style={label}>GST %<input style={inp} value={trip.gst} onChange={e => setT({ gst: e.target.value })} /></label>
            <label style={label}>TCS %<input style={inp} value={trip.tcs} onChange={e => setT({ tcs: e.target.value })} /></label>
          </div>
          <label style={{ ...label, marginTop: 10 }}>Notes<input style={inp} value={trip.notes} placeholder="Special requests, travel dates summary…" onChange={e => setT({ notes: e.target.value })} /></label>
        </div>

        {/* Cities */}
        {trip.cities.map((c, ci) => {
          const sources = sourcesByCity[ci];
          return (
            <div key={c.id} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto auto auto", gap: 10, alignItems: "end", marginBottom: 12 }}>
                <label style={label}>City<input style={inp} value={c.name} placeholder="Ubud" onChange={e => setCity(c.id, { name: e.target.value })} /></label>
                <label style={label}>Check-in<input style={inp} type="date" value={c.checkIn} onChange={e => setCity(c.id, { checkIn: e.target.value })} /></label>
                <label style={label}>Check-out<input style={inp} type="date" value={c.checkOut} onChange={e => setCity(c.id, { checkOut: e.target.value })} /></label>
                <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, paddingBottom: 8 }}>{nightsOf(c) ? `${nightsOf(c)}N` : ""}</span>
                <button style={btn()} onClick={() => suggest(c)} title="Uses 1 search"><Sparkles style={{ width: 14, height: 14 }} /> Suggest 5★</button>
                {trip.cities.length > 1 && <button style={btn()} onClick={() => setT({ cities: trip.cities.filter(x => x.id !== c.id) })}><X style={{ width: 14, height: 14 }} /></button>}
              </div>

              {c.suggest && c.suggest.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {c.suggest.map(s => (
                    <button key={s.name} style={{ ...btn(), padding: "5px 10px", fontSize: 12, fontWeight: 500 }}
                      onClick={() => setCity(c.id, { hotels: [...c.hotels.filter(h => h.name.trim()), newHotel(s.name)], suggest: c.suggest!.filter(x => x.name !== s.name) })}>
                      <Plus style={{ width: 12, height: 12 }} /> {s.name}{s.lowest_total ? ` · ${inr(s.lowest_total)}` : ""}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                  <thead>
                    <tr>
                      <th style={th}>Hotel</th><th style={th}>Room</th><th style={th}>Meal</th>
                      <th style={th}>Ottila ₹</th><th style={th}>TBO ₹</th><th style={th}>Other ₹</th><th style={th}>Free cxl until</th>
                      {sources.map(s => <th key={s} style={{ ...th, color: ACCENT }}>{s}</th>)}
                      <th style={th}>Best</th><th style={th}>Label</th><th style={th}>Pkg</th><th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.hotels.map(h => {
                      const sup = supplierPrices(h);
                      const all = [...sup.map(s => ({ source: s.source, rupees: s.rupees })), ...(h.online?.prices || []).map(p => ({ source: p.source, rupees: p.total }))];
                      const best = all.length ? all.reduce((a, b) => (b.rupees < a.rupees ? b : a)) : null;
                      const cell = (rupees?: number, isBest?: boolean, free?: boolean) => rupees ? (
                        <div style={{ background: isBest ? GOOD : "transparent", borderRadius: 8, padding: "3px 6px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: isBest ? 700 : 500 }}>{fmtCost(toCost(rupees))}</div>
                          <div style={{ fontSize: 10.5, color: MUTED }}>{inr(rupees)}{free ? " · free cxl" : ""}</div>
                        </div>) : <span style={{ color: MUTED }}>—</span>;
                      const priceInput = (field: "ottila" | "tbo" | "other") => (
                        <input style={{ ...inp, width: 96, background: best && best.source === (field === "other" ? h.otherSource : field === "ottila" ? "Ottila" : "TBO") && num(h[field]) ? GOOD : BG }}
                          value={h[field]} placeholder="₹" onChange={e => setHotel(c.id, h.id, { [field]: e.target.value } as any)} />);
                      return (
                        <tr key={h.id}>
                          <td style={td}>
                            <input style={{ ...inp, minWidth: 190 }} value={h.name} placeholder="Hotel name" onChange={e => setHotel(c.id, h.id, { name: e.target.value })} />
                            {h.loading && <div style={{ fontSize: 11, color: ACCENT, marginTop: 3, display: "flex", gap: 4, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> searching…</div>}
                            {h.error && <div style={{ fontSize: 11, color: "#E05B5B", marginTop: 3 }}>{h.error}</div>}
                            {h.online && !h.online.found && <div style={{ fontSize: 11, color: "#D48A2E", marginTop: 3 }}>Not found online{h.online.suggestions?.length ? ` — did you mean: ${h.online.suggestions.slice(0, 3).join(", ")}?` : ""}</div>}
                            {h.online?.found && h.online.name && h.online.name.toLowerCase() !== h.name.toLowerCase() && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Matched: {h.online.name}</div>}
                          </td>
                          <td style={td}><input style={{ ...inp, minWidth: 130 }} value={h.room} placeholder="Deluxe Room" onChange={e => setHotel(c.id, h.id, { room: e.target.value })} /></td>
                          <td style={td}><select style={{ ...inp, width: 62 }} value={h.meal} onChange={e => setHotel(c.id, h.id, { meal: e.target.value })}>{MEALS.map(m => <option key={m}>{m}</option>)}</select></td>
                          <td style={td}>{priceInput("ottila")}</td>
                          <td style={td}>{priceInput("tbo")}</td>
                          <td style={td}>
                            <input style={{ ...inp, width: 96, marginBottom: 3 }} value={h.otherSource} placeholder="Source" onChange={e => setHotel(c.id, h.id, { otherSource: e.target.value })} />
                            {priceInput("other")}
                          </td>
                          <td style={td}><input style={{ ...inp, width: 128 }} type="date" value={h.cancel} onChange={e => setHotel(c.id, h.id, { cancel: e.target.value })} /></td>
                          {sources.map(s => {
                            const p = h.online?.prices?.find(x => x.source === s);
                            return <td key={s} style={td}>{cell(p?.total, !!p && best?.source === s && best.rupees === p.total, p?.free_cancellation)}</td>;
                          })}
                          <td style={td}>{best ? <div style={{ fontSize: 12 }}><b>{best.source}</b><div style={{ color: MUTED, fontSize: 11 }}>{fmtCost(toCost(best.rupees))}</div></div> : "—"}</td>
                          <td style={td}><select style={{ ...inp, width: 76 }} value={h.label} onChange={e => setHotel(c.id, h.id, { label: e.target.value })}>{LABELS.map(l => <option key={l} value={l}>{l || "—"}</option>)}</select></td>
                          <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={h.inPkg} title="Include in the 'Per couple' total" onChange={e => setHotel(c.id, h.id, { inPkg: e.target.checked })} /></td>
                          <td style={td}><button style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }} onClick={() => setCity(c.id, { hotels: c.hotels.filter(x => x.id !== h.id) })}><X style={{ width: 14, height: 14 }} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button style={{ ...btn(), marginTop: 8, fontSize: 12 }} onClick={() => setCity(c.id, { hotels: [...c.hotels, newHotel()] })}><Plus style={{ width: 13, height: 13 }} /> Add hotel</button>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btn()} onClick={() => setT({ cities: [...trip.cities, newCity()] })}><Plus style={{ width: 14, height: 14 }} /> Add city</button>
          <button style={btn(true)} disabled={busy} onClick={() => runSearch(false)}>
            {busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Compare online prices
          </button>
          <button style={btn()} disabled={busy} onClick={() => runSearch(true)} title="Search every hotel again"><RefreshCw style={{ width: 14, height: 14 }} /> Refresh</button>
          <button style={btn(true)} disabled={busy} onClick={downloadExcel}><Download style={{ width: 15, height: 15 }} /> Download Excel</button>
          <span style={{ fontSize: 12, color: MUTED }}>{used ? `${used} search${used === 1 ? "" : "es"} used this session · ` : ""}Prices = whole stay, 1 room, incl. taxes where the site shows them. Green = cheapest.</span>
        </div>
        {msg && (
          <div style={{ fontSize: 13, color: msg.kind === "ok" ? "#2E9E6B" : "#E05B5B", display: "flex", gap: 6, alignItems: "center" }}>
            {msg.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <AlertTriangle style={{ width: 15, height: 15 }} />} {msg.text}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
