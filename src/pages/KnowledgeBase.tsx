import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import {
  Mail, Plus, Trash2, Pencil, Hotel, Activity, Car,
  Check, X, Loader2, AlertCircle, CheckCircle,
  Link2, Link2Off, Search, Star, Clock, Eye,
  Database, Sparkles, RefreshCw, Zap, Users,
  Handshake, ArrowRight, ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_GMAIL     = "https://fintech-dashboard-61vh.onrender.com/api/gmail";
const API_SUPPLIERS = "https://fintech-dashboard-61vh.onrender.com/api/suppliers";

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function Stars({ n }: { n: number }) {
  return <span className="flex gap-0.5">{Array.from({ length: n || 0 }).map((_, i) => <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />)}</span>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
function Inp({ ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${p.className || ""}`} />;
}
function Sel({ children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${p.className || ""}`}>{children}</select>;
}
function Btn({ variant = "primary", size = "md", loading, children, ...p }: {
  variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium transition rounded-lg disabled:opacity-50";
  const sz = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-4 py-2" };
  const vr = { primary: "bg-accent text-accent-foreground hover:bg-accent/90", secondary: "bg-muted text-foreground hover:bg-muted/80 border border-border", ghost: "text-muted-foreground hover:text-foreground hover:bg-muted/50", danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" };
  return <button {...p} disabled={p.disabled || loading} className={`${base} ${sz[size]} ${vr[variant]} ${p.className || ""}`}>{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}</button>;
}

interface GmailStatus { connected: boolean; configured: boolean; gmail_email?: string; auto_polling?: boolean; is_syncing?: boolean; interval_min?: number; latest?: any; }
interface LiveLog { is_syncing: boolean; log: string[]; latest: any; }
interface Hotel { id: string; hotel_name: string; destination: string; star_rating: number; room_type: string; meal_plan: string; price_per_night: number; currency: string; supplier_name: string; valid_to: string; source_email: string; source_date: string; cancellation_policy: string; }
interface SupplierActivity { id: string; activity_name: string; destination: string; description: string; duration_hours: number; price: number; currency: string; price_basis: string; supplier_name: string; valid_to: string; source_email: string; source_date: string; }
interface Transfer { id: string; transfer_type: string; destination: string; route: string; vehicle_type: string; price: number; currency: string; price_basis: string; supplier_name: string; valid_to: string; source_email: string; source_date: string; }

// ═══════════════════════════════════════════════════════════════════════════════
export default function KnowledgeBase() {
  const [tab, setTab] = useState<"overview" | "hotels" | "activities" | "transfers">("overview");
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Database className="h-6 w-6 text-accent" /> Knowledge Base
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Supplier rates extracted automatically from Gmail</p>
          </div>
          {/* Cross-links to related pages */}
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => navigate("/suppliers")}>
              <Users className="h-3.5 w-3.5" /> Suppliers <ChevronRight className="h-3 w-3" />
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => navigate("/supplier-reachout")}>
              <Mail className="h-3.5 w-3.5" /> Reachout <ChevronRight className="h-3 w-3" />
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => navigate("/active-deals")}>
              <Handshake className="h-3.5 w-3.5" /> Active Deals <ChevronRight className="h-3 w-3" />
            </Btn>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { key: "overview",   label: "Gmail & Live Sync", icon: <Mail className="h-3.5 w-3.5" /> },
            { key: "hotels",     label: "Hotels",            icon: <Hotel className="h-3.5 w-3.5" /> },
            { key: "activities", label: "Activities",        icon: <Activity className="h-3.5 w-3.5" /> },
            { key: "transfers",  label: "Transfers",         icon: <Car className="h-3.5 w-3.5" /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "overview"    && <OverviewPanel />}
        {tab === "hotels"      && <HotelsPanel />}
        {tab === "activities"  && <ActivitiesPanel />}
        {tab === "transfers"   && <TransfersPanel />}
      </div>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW — Gmail status + live log + supplier summary
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewPanel() {
  const [status, setStatus]     = useState<GmailStatus | null>(null);
  const [liveLog, setLiveLog]   = useState<LiveLog | null>(null);
  const [loading, setLoading]   = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [processed, setProcessed]   = useState<any[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const auth = await authHeader();
      const [sResp, lResp] = await Promise.all([
        fetch(`${API_GMAIL}/status`, { headers: { Authorization: auth } }),
        fetch(`${API_GMAIL}/live-log`, { headers: { Authorization: auth } }),
      ]);
      const [s, l] = await Promise.all([sResp.json(), lResp.json()]);
      setStatus(s);
      setLiveLog(l);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadProcessed = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/processed`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setProcessed(data.emails || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadStatus();
      await loadProcessed();

      // If connected but polling stopped (e.g. after server restart),
      // automatically restart the poll thread
      try {
        const auth = await authHeader();
        const sResp = await fetch(`${API_GMAIL}/status`, { headers: { Authorization: auth } });
        const s = await sResp.json();
        if (s.connected && !s.auto_polling) {
          await fetch(`${API_GMAIL}/start-polling`, { method: "POST", headers: { Authorization: auth } });
          setTimeout(loadStatus, 2000);
        }
      } catch (e) { console.error(e); }
    };

    init();

    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStatus, loadProcessed]);

  // Poll live log every 4 seconds
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const auth = await authHeader();
        const resp = await fetch(`${API_GMAIL}/live-log`, { headers: { Authorization: auth } });
        const data = await resp.json();
        setLiveLog(data);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      } catch { }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/oauth/url`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
    finally { setConnecting(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Gmail? Auto-polling will stop.")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/disconnect`, { method: "POST", headers: { Authorization: auth } });
      setStatus(s => s ? { ...s, connected: false, gmail_email: undefined, auto_polling: false } : s);
    } catch (e) { console.error(e); }
  };

  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/sync-now?max_emails=100`, { method: "POST", headers: { Authorization: auth } });
      setTimeout(() => { loadStatus(); loadProcessed(); setSyncingNow(false); }, 3000);
    } catch (e) { console.error(e); setSyncingNow(false); }
  };

  const latest = liveLog?.latest || status?.latest || {};
  const isSyncing = liveLog?.is_syncing || status?.is_syncing;

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Gmail connection card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${status?.connected ? "bg-green-100" : "bg-muted"}`}>
              <Mail className={`h-5 w-5 ${status?.connected ? "text-green-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Gmail Integration</h2>
              <p className="text-sm text-muted-foreground">
                {status?.connected
                  ? `Connected as ${status.gmail_email}`
                  : "Not connected — connect to auto-fetch supplier emails"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                {/* Auto-poll indicator */}
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${status.auto_polling ? "bg-green-50 text-green-600 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.auto_polling ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                  {status.auto_polling ? `Auto-syncing every ${status.interval_min}m` : "Polling stopped"}
                </div>
                <Btn variant="secondary" size="sm" loading={syncingNow} onClick={handleSyncNow}>
                  <Zap className="h-3.5 w-3.5" /> Sync Now
                </Btn>
                <Btn variant="ghost" size="sm" onClick={handleDisconnect}>
                  <Link2Off className="h-3.5 w-3.5" /> Disconnect
                </Btn>
              </>
            ) : (
              <>
                {status?.configured ? (
                  <Btn loading={connecting} onClick={handleConnect}>
                    <Link2 className="h-4 w-4" /> Connect Gmail
                  </Btn>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Add GOOGLE_CLIENT_ID to .env
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {status?.connected && (
          <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Emails are automatically fetched every <strong className="text-foreground">{status.interval_min} minutes</strong>
            </p>
            <p className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-accent" />
              Supplier rates are extracted and added to Hotels, Activities & Transfers
            </p>
            <p className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-accent" />
              New suppliers are automatically added to your <button className="text-accent underline underline-offset-2 hover:no-underline" onClick={() => window.location.href = "/suppliers"}>Suppliers</button> page
            </p>
          </div>
        )}
      </div>

      {/* Latest stats */}
      {latest && Object.keys(latest).length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Emails checked",  value: latest.fetched || 0,           color: "text-foreground" },
            { label: "Hotels added",    value: latest.hotels_added || 0,      color: "text-blue-600" },
            { label: "Activities",      value: latest.activities_added || 0,  color: "text-emerald-600" },
            { label: "Transfers",       value: latest.transfers_added || 0,   color: "text-amber-600" },
            { label: "Suppliers found", value: latest.suppliers_created || 0, color: "text-purple-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Live log */}
      {status?.connected && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Live Extraction Log</span>
              {isSyncing && (
                <span className="flex items-center gap-1.5 text-xs text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" /> Syncing...
                </span>
              )}
            </div>
            <button onClick={loadStatus} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          <div ref={logRef}
            className="bg-gray-950 p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5 min-h-20">
            {(liveLog?.log || []).length === 0 ? (
              <p className="text-gray-600">Waiting for next sync cycle...</p>
            ) : (
              (liveLog?.log || []).map((line, i) => (
                <p key={i} className={
                  line.startsWith("  ✓") ? "text-green-400" :
                  line.includes("ERROR") ? "text-red-400" :
                  line.includes("⚠") ? "text-yellow-400" :
                  line.startsWith("\n✓") || line.startsWith("✓") ? "text-cyan-400 font-bold" :
                  "text-gray-400"
                }>{line}</p>
              ))
            )}
            {isSyncing && <p className="text-gray-600 animate-pulse">▌</p>}
          </div>
        </div>
      )}

      {/* Processed emails table */}
      {processed.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Recently Processed Emails</p>
            <span className="text-xs text-muted-foreground">{processed.length} total</span>
          </div>
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {processed.slice(0, 30).map(email => (
              <div key={email.id} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-muted/20">
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                  email.status === "processed" ? "bg-green-50 text-green-600 border-green-200" :
                  email.status === "irrelevant" ? "bg-gray-50 text-gray-400 border-gray-200" :
                  email.status === "no_data"   ? "bg-amber-50 text-amber-600 border-amber-200" :
                  "bg-red-50 text-red-500 border-red-200"
                }`}>{email.status}</span>
                <span className="flex-1 text-muted-foreground truncate">{email.supplier_name || "Unknown"}</span>
                <span className="text-xs text-muted-foreground shrink-0">{email.extraction_type || "—"}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDate(email.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-links section */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: <Users className="h-5 w-5" />, title: "Suppliers", desc: "View and manage all suppliers extracted from Gmail", path: "/suppliers", color: "text-blue-600 bg-blue-50" },
          { icon: <Mail className="h-5 w-5" />,  title: "Supplier Reachout", desc: "Send bulk outreach to suppliers in your knowledge base", path: "/supplier-reachout", color: "text-purple-600 bg-purple-50" },
          { icon: <Handshake className="h-5 w-5" />, title: "Active Deals", desc: "Track deals with suppliers found in Gmail", path: "/active-deals", color: "text-emerald-600 bg-emerald-50" },
        ].map(item => (
          <button key={item.path} onClick={() => window.location.href = item.path}
            className="rounded-xl border bg-card p-5 text-left hover:border-accent/40 hover:bg-accent/5 transition group">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}>{item.icon}</div>
            <p className="font-medium text-foreground group-hover:text-accent transition">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            <div className="flex items-center gap-1 text-xs text-accent mt-3 opacity-0 group-hover:opacity-100 transition">
              Go to {item.title} <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOTELS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function HotelsPanel() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Hotel | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSrc, setShowSrc] = useState<string | null>(null);
  const BLANK = { supplier_name: "", hotel_name: "", destination: "", star_rating: 4, room_type: "Deluxe Room", meal_plan: "BB", price_per_night: 0, currency: "INR", valid_from: "", valid_to: "", cancellation_policy: "", source_email: "", source_date: "" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_SUPPLIERS}/hotels`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setHotels(data.hotels);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = hotels.filter(h => !search || h.hotel_name.toLowerCase().includes(search.toLowerCase()) || h.destination.toLowerCase().includes(search.toLowerCase()) || h.supplier_name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.hotel_name || !form.destination || !form.price_per_night) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      const url = editing ? `${API_SUPPLIERS}/hotels/${editing.id}` : `${API_SUPPLIERS}/hotels`;
      await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this hotel rate?")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_SUPPLIERS}/hotels/${id}`, { method: "DELETE", headers: { Authorization: auth } });
      setHotels(prev => prev.filter(h => h.id !== id));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hotels, destinations, suppliers..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
        </div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add Manually</Btn>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">{editing ? "Edit Hotel Rate" : "Add Hotel Rate Manually"}</h3>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier Name" required><Inp value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Emirates Travel Group" /></Field>
            <Field label="Hotel Name" required><Inp value={form.hotel_name} onChange={e => set("hotel_name", e.target.value)} placeholder="JW Marriott Marquis" /></Field>
            <Field label="Destination" required><Inp value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <Field label="Stars"><Sel value={form.star_rating} onChange={e => set("star_rating", parseInt(e.target.value))}>{[3,4,5].map(n=><option key={n} value={n}>{n}★</option>)}</Sel></Field>
            <Field label="Room Type"><Inp value={form.room_type} onChange={e => set("room_type", e.target.value)} placeholder="Deluxe Room" /></Field>
            <Field label="Meal Plan"><Sel value={form.meal_plan} onChange={e => set("meal_plan", e.target.value)}>{[["BB","Breakfast"],["MAP","Half Board"],["AP","Full Board"],["EP","Room Only"],["AI","All Inclusive"]].map(([v,l])=><option key={v} value={v}>{l} ({v})</option>)}</Sel></Field>
            <Field label="Price/Night" required><Inp type="number" value={form.price_per_night} onChange={e => set("price_per_night", parseFloat(e.target.value))} /></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={e => set("currency", e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <div />
            <Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <div />
            <div className="col-span-3"><Field label="Cancellation Policy"><Inp value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} placeholder="Free cancellation up to 48 hours before check-in" /></Field></div>
            <Field label="Source Email"><Inp value={form.source_email} onChange={e => set("source_email", e.target.value)} placeholder="rates@supplier.com" /></Field>
            <Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.hotel_name || !form.destination || !form.price_per_night}><Check className="h-4 w-4" /> {editing ? "Save" : "Add Hotel"}</Btn>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Hotel className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{search ? "No hotels match your search." : "No hotel rates yet — connect Gmail to auto-extract, or add manually."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">{["Hotel","⭐","Destination","Room","Meal","Price/Night","Supplier","Valid To","Source",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map(h => (
                <tr key={h.id} className="hover:bg-muted/20 transition">
                  <td className="px-3 py-2.5 font-medium text-foreground">{h.hotel_name}</td>
                  <td className="px-3 py-2.5"><Stars n={h.star_rating} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{h.destination}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.room_type}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.meal_plan}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{new Intl.NumberFormat("en-IN",{style:"currency",currency:h.currency,maximumFractionDigits:0}).format(h.price_per_night)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.supplier_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(h.valid_to)}</td>
                  <td className="px-3 py-2.5 relative">
                    {h.source_email && <button onClick={() => setShowSrc(showSrc === h.id ? null : h.id)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Source</button>}
                    {showSrc === h.id && (
                      <div className="absolute z-10 bottom-full mb-1 left-0 bg-popover border rounded-lg shadow-lg p-3 w-56 text-xs space-y-1">
                        {h.source_email && <p><span className="text-muted-foreground">From:</span> {h.source_email}</p>}
                        {h.source_date && <p><span className="text-muted-foreground">Date:</span> {fmtDate(h.source_date)}</p>}
                        {h.cancellation_policy && <p><span className="text-muted-foreground">Policy:</span> {h.cancellation_policy}</p>}
                        <button onClick={() => setShowSrc(null)} className="absolute top-1 right-1 text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => { setForm({...h}); setEditing(h); setShowForm(true); }} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(h.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} hotel rate{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function ActivitiesPanel() {
  const [items, setItems] = useState<SupplierActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierActivity | null>(null);
  const [saving, setSaving] = useState(false);
  const BLANK = { supplier_name: "", activity_name: "", destination: "", description: "", duration_hours: 2, price: 0, currency: "INR", price_basis: "per_person", valid_from: "", valid_to: "", source_email: "", source_date: "" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const auth = await authHeader(); const resp = await fetch(`${API_SUPPLIERS}/activities`, { headers: { Authorization: auth } }); const data = await resp.json(); if (data.success) setItems(data.activities); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(a => !search || a.activity_name.toLowerCase().includes(search.toLowerCase()) || a.destination.toLowerCase().includes(search.toLowerCase()) || a.supplier_name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.activity_name || !form.destination || !form.price) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      await fetch(editing ? `${API_SUPPLIERS}/activities/${editing.id}` : `${API_SUPPLIERS}/activities`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    try { const auth = await authHeader(); await fetch(`${API_SUPPLIERS}/activities/${id}`, { method: "DELETE", headers: { Authorization: auth } }); setItems(prev => prev.filter(a => a.id !== id)); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities..." className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" /></div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add Manually</Btn>
      </div>
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-medium text-foreground">{editing ? "Edit Activity" : "Add Activity Manually"}</h3><button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier" required><Inp value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Gulf Holidays DMC" /></Field>
            <Field label="Activity Name" required><Inp value={form.activity_name} onChange={e => set("activity_name", e.target.value)} placeholder="Desert Safari" /></Field>
            <Field label="Destination" required><Inp value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <div className="col-span-3"><Field label="Description"><Inp value={form.description} onChange={e => set("description", e.target.value)} placeholder="Dune bashing, camel riding, BBQ dinner..." /></Field></div>
            <Field label="Duration (hrs)"><Inp type="number" step="0.5" value={form.duration_hours} onChange={e => set("duration_hours", parseFloat(e.target.value))} /></Field>
            <Field label="Price" required><Inp type="number" value={form.price} onChange={e => set("price", parseFloat(e.target.value))} /></Field>
            <Field label="Price Basis"><Sel value={form.price_basis} onChange={e => set("price_basis", e.target.value)}><option value="per_person">Per Person</option><option value="per_group">Per Group</option></Sel></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={e => set("currency", e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <Field label="Source Email"><Inp value={form.source_email} onChange={e => set("source_email", e.target.value)} /></Field>
            <Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.activity_name || !form.destination || !form.price}><Check className="h-4 w-4" /> {editing ? "Save" : "Add Activity"}</Btn>
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Activity className="h-8 w-8 mx-auto mb-2 opacity-20" /><p className="text-sm">No activities yet.</p></div>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">{["Activity","Destination","Duration","Price","Basis","Supplier","Valid To",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-muted/20 transition">
                    <td className="px-3 py-2.5"><p className="font-medium text-foreground">{a.activity_name}</p>{a.description && <p className="text-xs text-muted-foreground truncate max-w-40">{a.description}</p>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{a.destination}</td>
                    <td className="px-3 py-2.5 text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.duration_hours}h</span></td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{new Intl.NumberFormat("en-IN",{style:"currency",currency:a.currency,maximumFractionDigits:0}).format(a.price)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{a.price_basis?.replace("per_","")}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{a.supplier_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(a.valid_to)}</td>
                    <td className="px-3 py-2.5"><div className="flex gap-1"><button onClick={() => { setForm({...a}); setEditing(a); setShowForm(true); }} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50 transition"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} activit{filtered.length !== 1 ? "ies" : "y"}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function TransfersPanel() {
  const [items, setItems] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [saving, setSaving] = useState(false);
  const BLANK = { supplier_name: "", transfer_type: "Airport-Hotel", destination: "", route: "", vehicle_type: "Sedan", price: 0, currency: "INR", price_basis: "per_vehicle", valid_from: "", valid_to: "", source_email: "", source_date: "" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const auth = await authHeader(); const resp = await fetch(`${API_SUPPLIERS}/transfers`, { headers: { Authorization: auth } }); const data = await resp.json(); if (data.success) setItems(data.transfers); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(t => !search || t.transfer_type.toLowerCase().includes(search.toLowerCase()) || t.destination.toLowerCase().includes(search.toLowerCase()) || t.supplier_name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.transfer_type || !form.destination || !form.price) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      await fetch(editing ? `${API_SUPPLIERS}/transfers/${editing.id}` : `${API_SUPPLIERS}/transfers`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transfer?")) return;
    try { const auth = await authHeader(); await fetch(`${API_SUPPLIERS}/transfers/${id}`, { method: "DELETE", headers: { Authorization: auth } }); setItems(prev => prev.filter(t => t.id !== id)); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transfers..." className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" /></div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add Manually</Btn>
      </div>
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-medium text-foreground">{editing ? "Edit Transfer" : "Add Transfer Manually"}</h3><button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier" required><Inp value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Gulf Holidays DMC" /></Field>
            <Field label="Type" required><Sel value={form.transfer_type} onChange={e => set("transfer_type", e.target.value)}>{["Airport-Hotel","Hotel-Airport","Hotel-Hotel","Sightseeing","Point to Point"].map(t=><option key={t}>{t}</option>)}</Sel></Field>
            <Field label="Destination" required><Inp value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <div className="col-span-2"><Field label="Route"><Inp value={form.route} onChange={e => set("route", e.target.value)} placeholder="Dubai International Airport ↔ City Hotels" /></Field></div>
            <Field label="Vehicle"><Inp value={form.vehicle_type} onChange={e => set("vehicle_type", e.target.value)} placeholder="Toyota Camry" /></Field>
            <Field label="Price" required><Inp type="number" value={form.price} onChange={e => set("price", parseFloat(e.target.value))} /></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={e => set("currency", e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <Field label="Price Basis"><Sel value={form.price_basis} onChange={e => set("price_basis", e.target.value)}><option value="per_vehicle">Per Vehicle</option><option value="per_person">Per Person</option></Sel></Field>
            <Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <div />
            <Field label="Source Email"><Inp value={form.source_email} onChange={e => set("source_email", e.target.value)} /></Field>
            <Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.transfer_type || !form.destination || !form.price}><Check className="h-4 w-4" /> {editing ? "Save" : "Add Transfer"}</Btn>
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Car className="h-8 w-8 mx-auto mb-2 opacity-20" /><p className="text-sm">No transfers yet.</p></div>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">{["Type","Route","Vehicle","Price","Destination","Supplier","Valid To",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-muted/20 transition">
                    <td className="px-3 py-2.5 font-medium text-foreground">{t.transfer_type}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-44 truncate">{t.route || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.vehicle_type}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{new Intl.NumberFormat("en-IN",{style:"currency",currency:t.currency,maximumFractionDigits:0}).format(t.price)}<span className="text-xs font-normal text-muted-foreground">/{t.price_basis?.replace("per_","")}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.destination}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{t.supplier_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(t.valid_to)}</td>
                    <td className="px-3 py-2.5"><div className="flex gap-1"><button onClick={() => { setForm({...t}); setEditing(t); setShowForm(true); }} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50 transition"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} transfer{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
