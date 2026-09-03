import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import {
  Mail, RefreshCw, Plus, Trash2, Pencil, Hotel, Activity, Car,
  Check, X, Loader2, ChevronDown, ChevronUp, AlertCircle,
  CheckCircle, Link2, Link2Off, Eye, Search, Star, Clock,
  FileText, Upload, Database, Sparkles,
} from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API_GMAIL     = "https://fintech-dashboard-61vh.onrender.com/api/gmail";
const API_SUPPLIERS = "https://fintech-dashboard-61vh.onrender.com/api/suppliers";

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GmailStatus {
  connected: boolean;
  configured: boolean;
  gmail_email?: string;
  message?: string;
}

interface SyncJob {
  status: "running" | "done" | "error";
  progress: string;
  log: string[];
  result?: {
    fetched: number;
    extracted: number;
    hotels_added: number;
    activities_added: number;
    transfers_added: number;
    errors: number;
  };
}

interface SupplierHotel {
  id: string;
  supplier_name: string;
  hotel_name: string;
  destination: string;
  star_rating: number;
  room_type: string;
  meal_plan: string;
  price_per_night: number;
  currency: string;
  valid_from: string;
  valid_to: string;
  cancellation_policy: string;
  source_email: string;
  source_date: string;
  created_at: string;
}

interface SupplierActivity {
  id: string;
  supplier_name: string;
  activity_name: string;
  destination: string;
  description: string;
  duration_hours: number;
  price: number;
  currency: string;
  price_basis: string;
  valid_from: string;
  valid_to: string;
  source_email: string;
  source_date: string;
  created_at: string;
}

interface SupplierTransfer {
  id: string;
  supplier_name: string;
  transfer_type: string;
  destination: string;
  route: string;
  vehicle_type: string;
  price: number;
  currency: string;
  price_basis: string;
  valid_from: string;
  valid_to: string;
  source_email: string;
  source_date: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(n: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: n || 0 }).map((_, i) => (
        <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

// ─── Reusable input components ────────────────────────────────────────────────
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

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground
      placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30
      focus:border-accent transition ${props.className || ""}`} />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground
      focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${props.className || ""}`}>
      {children}
    </select>
  );
}

function Btn({ variant = "primary", size = "md", loading, children, ...props }: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium transition rounded-lg disabled:opacity-50";
  const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-4 py-2" };
  const variants = {
    primary:   "bg-accent text-accent-foreground hover:bg-accent/90",
    secondary: "bg-muted text-foreground hover:bg-muted/80 border border-border",
    ghost:     "text-muted-foreground hover:text-foreground hover:bg-muted/50",
    danger:    "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
  };
  return (
    <button {...props} disabled={props.disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${props.className || ""}`}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function KnowledgeBase() {
  const [tab, setTab] = useState<"gmail" | "hotels" | "activities" | "transfers">("gmail");

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Database className="h-6 w-6 text-accent" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Supplier data fetched from Gmail + manually entered rates
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { key: "gmail",      label: "Gmail Sync",   icon: <Mail className="h-3.5 w-3.5" /> },
            { key: "hotels",     label: "Hotels",       icon: <Hotel className="h-3.5 w-3.5" /> },
            { key: "activities", label: "Activities",   icon: <Activity className="h-3.5 w-3.5" /> },
            { key: "transfers",  label: "Transfers",    icon: <Car className="h-3.5 w-3.5" /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "gmail"      && <GmailSyncPanel />}
        {tab === "hotels"     && <HotelsPanel />}
        {tab === "activities" && <ActivitiesPanel />}
        {tab === "transfers"  && <TransfersPanel />}
      </div>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL SYNC PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function GmailSyncPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<SyncJob | null>(null);
  const [maxEmails, setMaxEmails] = useState(20);
  const [processed, setProcessed] = useState<any[]>([]);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/status`, { headers: { Authorization: auth } });
      const data = await resp.json();
      setStatus(data);
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
    loadStatus();
    loadProcessed();

    // Handle OAuth redirect result
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "1") {
      loadStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStatus, loadProcessed]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.log]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollJob = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const auth = await authHeader();
        const resp = await fetch(`${API_GMAIL}/sync/status/${id}`, { headers: { Authorization: auth } });
        const data = await resp.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          stopPolling();
          setSyncing(false);
          loadProcessed();
        }
      } catch (e) { console.error(e); }
    }, 2000);
  }, [loadProcessed]);

  useEffect(() => () => stopPolling(), []);

  const handleConnect = async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/oauth/url`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Gmail? You can reconnect at any time.")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/disconnect`, { method: "POST", headers: { Authorization: auth } });
      setStatus(s => s ? { ...s, connected: false, gmail_email: undefined } : s);
    } catch (e) { console.error(e); }
  };

  const handleSync = async () => {
    setSyncing(true);
    setJob(null);
    setShowLog(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/sync?max_emails=${maxEmails}`, {
        method: "POST",
        headers: { Authorization: auth },
      });
      const data = await resp.json();
      if (data.success) {
        setJobId(data.job_id);
        pollJob(data.job_id);
      }
    } catch (e: any) {
      console.error(e);
      setSyncing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Connection card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" /> Gmail Integration
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically extract supplier rates from your Gmail inbox
            </p>
          </div>
          {status?.connected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <CheckCircle className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full border">
              <Link2Off className="h-3 w-3" /> Not connected
            </span>
          )}
        </div>

        {!status?.configured && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Google OAuth not configured</p>
              <p className="mt-1 text-amber-700">
                Add <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> to your backend <code className="bg-amber-100 px-1 rounded">.env</code> file.
                See README for setup instructions.
              </p>
            </div>
          </div>
        )}

        {status?.configured && !status?.connected && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 border p-4 text-sm space-y-2 text-muted-foreground">
              <p className="font-medium text-foreground">How Gmail sync works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Connect your Gmail account (read-only access)</li>
                <li>The system fetches supplier emails with attachments</li>
                <li>AI classifies and extracts hotel/activity/transfer rates</li>
                <li>Extracted data is validated and saved to the knowledge base</li>
                <li>Emails already processed are never re-processed</li>
              </ol>
            </div>
            <Btn onClick={handleConnect} disabled={!status.configured}>
              <Link2 className="h-4 w-4" /> Connect Gmail Account
            </Btn>
          </div>
        )}

        {status?.connected && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connected as: <span className="font-medium text-foreground">{status.gmail_email}</span>
            </p>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Fetch up to</label>
                <select
                  value={maxEmails}
                  onChange={e => setMaxEmails(parseInt(e.target.value))}
                  className="px-2 py-1 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} emails</option>)}
                </select>
              </div>
              <Btn onClick={handleSync} loading={syncing} disabled={syncing}>
                <RefreshCw className="h-4 w-4" />
                {syncing ? "Syncing..." : "Sync Now"}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={handleDisconnect}>
                <Link2Off className="h-3.5 w-3.5" /> Disconnect
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Sync log */}
      {(job || syncing) && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-3 bg-muted/30 hover:bg-muted/50 transition"
            onClick={() => setShowLog(v => !v)}
          >
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> :
               job?.status === "done" ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> :
               job?.status === "error" ? <AlertCircle className="h-3.5 w-3.5 text-red-500" /> : null}
              Sync Log
            </span>
            {showLog ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showLog && (
            <div className="p-4 space-y-3">
              {job?.progress && (
                <p className="text-sm text-foreground font-medium">{job.progress}</p>
              )}

              {job?.result && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Emails fetched", value: job.result.fetched },
                    { label: "Hotels added",   value: job.result.hotels_added,     cls: "text-blue-600" },
                    { label: "Activities",     value: job.result.activities_added, cls: "text-emerald-600" },
                    { label: "Transfers",      value: job.result.transfers_added,  cls: "text-amber-600" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className={`text-2xl font-bold ${s.cls || "text-foreground"}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div
                ref={logRef}
                className="bg-gray-950 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5"
              >
                {(job?.log || []).map((line, i) => (
                  <p key={i} className={
                    line.startsWith("  ✓") ? "text-green-400" :
                    line.startsWith("  ERROR") || line.startsWith("ERROR") ? "text-red-400" :
                    line.startsWith("  WARNING") ? "text-yellow-400" :
                    line.startsWith("\nIngestion") ? "text-cyan-400 font-bold" :
                    "text-gray-300"
                  }>{line}</p>
                ))}
                {syncing && <p className="text-gray-500 animate-pulse">▌</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processed emails log */}
      {processed.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b">
            <p className="text-sm font-medium text-foreground">Recently Processed Emails ({processed.length})</p>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {processed.slice(0, 20).map(email => (
              <div key={email.id} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-muted/20">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                    email.status === "processed" ? "bg-green-50 text-green-600 border-green-200" :
                    email.status === "irrelevant" ? "bg-gray-50 text-gray-500 border-gray-200" :
                    email.status === "no_data"   ? "bg-amber-50 text-amber-600 border-amber-200" :
                    email.status === "error"     ? "bg-red-50 text-red-500 border-red-200" :
                    "bg-blue-50 text-blue-600 border-blue-200"
                  }`}>
                    {email.status}
                  </span>
                  <span className="text-muted-foreground truncate">{email.supplier_name || "Unknown"}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDate(email.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOTELS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function HotelsPanel() {
  const [hotels, setHotels] = useState<SupplierHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierHotel | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSource, setShowSource] = useState<string | null>(null);

  const BLANK_HOTEL = {
    supplier_name: "", hotel_name: "", destination: "", star_rating: 4,
    room_type: "Deluxe Room", meal_plan: "BB", price_per_night: 0,
    currency: "INR", valid_from: "", valid_to: "",
    cancellation_policy: "", source_email: "", source_date: "",
  };
  const [form, setForm] = useState<any>(BLANK_HOTEL);

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

  const filtered = hotels.filter(h =>
    !search ||
    h.hotel_name.toLowerCase().includes(search.toLowerCase()) ||
    h.destination.toLowerCase().includes(search.toLowerCase()) ||
    h.supplier_name.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setForm(BLANK_HOTEL); setEditing(null); setShowForm(true); };
  const openEdit = (h: SupplierHotel) => { setForm({ ...h }); setEditing(h); setShowForm(true); };

  const handleSave = async () => {
    if (!form.hotel_name || !form.destination || !form.price_per_night) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      const url = editing ? `${API_SUPPLIERS}/hotels/${editing.id}` : `${API_SUPPLIERS}/hotels`;
      const method = editing ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
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

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search hotels, destinations, suppliers..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
        </div>
        <Btn onClick={openNew}><Plus className="h-4 w-4" /> Add Hotel</Btn>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">{editing ? "Edit Hotel Rate" : "Add Hotel Rate"}</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier Name" required><Input value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Emirates Travel Group" /></Field>
            <Field label="Hotel Name" required><Input value={form.hotel_name} onChange={e => set("hotel_name", e.target.value)} placeholder="JW Marriott Marquis" /></Field>
            <Field label="Destination" required><Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <Field label="Star Rating">
              <Select value={form.star_rating} onChange={e => set("star_rating", parseInt(e.target.value))}>
                {[3,4,5].map(n => <option key={n} value={n}>{n} Star</option>)}
              </Select>
            </Field>
            <Field label="Room Type"><Input value={form.room_type} onChange={e => set("room_type", e.target.value)} placeholder="Deluxe Room" /></Field>
            <Field label="Meal Plan">
              <Select value={form.meal_plan} onChange={e => set("meal_plan", e.target.value)}>
                {[["BB","Breakfast"],["MAP","Half Board"],["AP","Full Board"],["EP","Room Only"],["AI","All Inclusive"]].map(([v,l]) => (
                  <option key={v} value={v}>{l} ({v})</option>
                ))}
              </Select>
            </Field>
            <Field label="Price / Night" required><Input type="number" value={form.price_per_night} onChange={e => set("price_per_night", parseFloat(e.target.value))} /></Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={e => set("currency", e.target.value)}>
                {["INR","USD","AED","SGD","EUR","GBP"].map(c => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <div />
            <Field label="Valid From"><Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Input type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <div />
            <div className="col-span-3">
              <Field label="Cancellation Policy"><Input value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} placeholder="Free cancellation up to 48 hours before check-in" /></Field>
            </div>
            <Field label="Source Email"><Input value={form.source_email} onChange={e => set("source_email", e.target.value)} placeholder="rates@supplier.com" /></Field>
            <Field label="Source Date"><Input type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.hotel_name || !form.destination || !form.price_per_night}>
              <Check className="h-4 w-4" /> {editing ? "Save Changes" : "Add Hotel"}
            </Btn>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Hotel className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{search ? "No hotels match your search." : "No hotel rates yet. Add manually or sync Gmail."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Hotel","Stars","Destination","Room","Meal","Price/Night","Supplier","Valid To","Source",""].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(h => (
                <tr key={h.id} className="hover:bg-muted/20 transition">
                  <td className="px-3 py-2.5 font-medium text-foreground">{h.hotel_name}</td>
                  <td className="px-3 py-2.5"><Stars n={h.star_rating} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{h.destination}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{h.room_type}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{h.meal_plan}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{new Intl.NumberFormat("en-IN",{style:"currency",currency:h.currency,maximumFractionDigits:0}).format(h.price_per_night)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.supplier_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(h.valid_to)}</td>
                  <td className="px-3 py-2.5">
                    {h.source_email && (
                      <button onClick={() => setShowSource(showSource === h.id ? null : h.id)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
                        <Eye className="h-3 w-3" /> Source
                      </button>
                    )}
                    {showSource === h.id && (
                      <div className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-3 w-60 text-xs space-y-1 mt-1">
                        <p><span className="text-muted-foreground">From:</span> {h.source_email}</p>
                        <p><span className="text-muted-foreground">Date:</span> {fmtDate(h.source_date)}</p>
                        {h.cancellation_policy && <p><span className="text-muted-foreground">Policy:</span> {h.cancellation_policy}</p>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(h)} className="text-muted-foreground hover:text-foreground transition p-1 rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(h.id)} className="text-muted-foreground hover:text-red-500 transition p-1 rounded hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} hotel rate{filtered.length !== 1 ? "s" : ""} {search ? "matching" : "total"}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function ActivitiesPanel() {
  const [activities, setActivities] = useState<SupplierActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierActivity | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = {
    supplier_name: "", activity_name: "", destination: "", description: "",
    duration_hours: 2, price: 0, currency: "INR", price_basis: "per_person",
    valid_from: "", valid_to: "", source_email: "", source_date: "",
  };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_SUPPLIERS}/activities`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setActivities(data.activities);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = activities.filter(a =>
    !search ||
    a.activity_name.toLowerCase().includes(search.toLowerCase()) ||
    a.destination.toLowerCase().includes(search.toLowerCase()) ||
    a.supplier_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.activity_name || !form.destination || !form.price) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      const url = editing ? `${API_SUPPLIERS}/activities/${editing.id}` : `${API_SUPPLIERS}/activities`;
      const method = editing ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_SUPPLIERS}/activities/${id}`, { method: "DELETE", headers: { Authorization: auth } });
      setActivities(prev => prev.filter(a => a.id !== id));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search activities..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
        </div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Activity
        </Btn>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">{editing ? "Edit Activity" : "Add Activity"}</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier Name" required><Input value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Gulf Holidays DMC" /></Field>
            <Field label="Activity Name" required><Input value={form.activity_name} onChange={e => set("activity_name", e.target.value)} placeholder="Desert Safari" /></Field>
            <Field label="Destination" required><Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <div className="col-span-3">
              <Field label="Description"><Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Dune bashing, camel riding, BBQ dinner..." /></Field>
            </div>
            <Field label="Duration (hours)"><Input type="number" step="0.5" value={form.duration_hours} onChange={e => set("duration_hours", parseFloat(e.target.value))} /></Field>
            <Field label="Price" required><Input type="number" value={form.price} onChange={e => set("price", parseFloat(e.target.value))} /></Field>
            <Field label="Price Basis">
              <Select value={form.price_basis} onChange={e => set("price_basis", e.target.value)}>
                <option value="per_person">Per Person</option>
                <option value="per_group">Per Group</option>
                <option value="per_vehicle">Per Vehicle</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={e => set("currency", e.target.value)}>
                {["INR","USD","AED","SGD","EUR"].map(c => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Valid From"><Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Input type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <Field label="Source Email"><Input value={form.source_email} onChange={e => set("source_email", e.target.value)} placeholder="rates@supplier.com" /></Field>
            <Field label="Source Date"><Input type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.activity_name || !form.destination || !form.price}>
              <Check className="h-4 w-4" /> {editing ? "Save Changes" : "Add Activity"}
            </Btn>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{search ? "No activities match your search." : "No activities yet."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Activity","Destination","Duration","Price","Basis","Supplier","Valid To",""].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-muted/20 transition">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground">{a.activity_name}</p>
                    {a.description && <p className="text-xs text-muted-foreground truncate max-w-48">{a.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{a.destination}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.duration_hours}h</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {new Intl.NumberFormat("en-IN",{style:"currency",currency:a.currency,maximumFractionDigits:0}).format(a.price)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{a.price_basis?.replace("per_","")}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{a.supplier_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(a.valid_to)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setForm({...a}); setEditing(a); setShowForm(true); }}
                        className="text-muted-foreground hover:text-foreground transition p-1 rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(a.id)}
                        className="text-muted-foreground hover:text-red-500 transition p-1 rounded hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} activit{filtered.length !== 1 ? "ies" : "y"} {search ? "matching" : "total"}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function TransfersPanel() {
  const [transfers, setTransfers] = useState<SupplierTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierTransfer | null>(null);
  const [saving, setSaving] = useState(false);

  const BLANK = {
    supplier_name: "", transfer_type: "Airport-Hotel", destination: "",
    route: "", vehicle_type: "Sedan", price: 0, currency: "INR",
    price_basis: "per_vehicle", valid_from: "", valid_to: "",
    source_email: "", source_date: "",
  };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_SUPPLIERS}/transfers`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setTransfers(data.transfers);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = transfers.filter(t =>
    !search ||
    t.transfer_type.toLowerCase().includes(search.toLowerCase()) ||
    t.destination.toLowerCase().includes(search.toLowerCase()) ||
    t.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.route || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.transfer_type || !form.destination || !form.price) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      const url = editing ? `${API_SUPPLIERS}/transfers/${editing.id}` : `${API_SUPPLIERS}/transfers`;
      await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transfer rate?")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_SUPPLIERS}/transfers/${id}`, { method: "DELETE", headers: { Authorization: auth } });
      setTransfers(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search transfers..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
        </div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Transfer
        </Btn>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">{editing ? "Edit Transfer" : "Add Transfer"}</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier Name" required><Input value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Gulf Holidays DMC" /></Field>
            <Field label="Transfer Type" required>
              <Select value={form.transfer_type} onChange={e => set("transfer_type", e.target.value)}>
                {["Airport-Hotel","Hotel-Airport","Hotel-Hotel","Sightseeing","Point to Point"].map(t => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Destination" required><Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <div className="col-span-2">
              <Field label="Route"><Input value={form.route} onChange={e => set("route", e.target.value)} placeholder="Dubai International Airport ↔ City Hotels" /></Field>
            </div>
            <Field label="Vehicle Type"><Input value={form.vehicle_type} onChange={e => set("vehicle_type", e.target.value)} placeholder="Toyota Camry" /></Field>
            <Field label="Price" required><Input type="number" value={form.price} onChange={e => set("price", parseFloat(e.target.value))} /></Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={e => set("currency", e.target.value)}>
                {["INR","USD","AED","SGD","EUR"].map(c => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Price Basis">
              <Select value={form.price_basis} onChange={e => set("price_basis", e.target.value)}>
                <option value="per_vehicle">Per Vehicle</option>
                <option value="per_person">Per Person</option>
              </Select>
            </Field>
            <Field label="Valid From"><Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Input type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <div />
            <Field label="Source Email"><Input value={form.source_email} onChange={e => set("source_email", e.target.value)} /></Field>
            <Field label="Source Date"><Input type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.transfer_type || !form.destination || !form.price}>
              <Check className="h-4 w-4" /> {editing ? "Save Changes" : "Add Transfer"}
            </Btn>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{search ? "No transfers match your search." : "No transfers yet."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Type","Route","Vehicle","Price","Destination","Supplier","Valid To",""].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-muted/20 transition">
                  <td className="px-3 py-2.5 font-medium text-foreground">{t.transfer_type}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-48 truncate">{t.route || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{t.vehicle_type}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {new Intl.NumberFormat("en-IN",{style:"currency",currency:t.currency,maximumFractionDigits:0}).format(t.price)}
                    <span className="text-xs font-normal text-muted-foreground">/{t.price_basis?.replace("per_","")}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{t.destination}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{t.supplier_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(t.valid_to)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setForm({...t}); setEditing(t); setShowForm(true); }}
                        className="text-muted-foreground hover:text-foreground transition p-1 rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(t.id)}
                        className="text-muted-foreground hover:text-red-500 transition p-1 rounded hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} transfer{filtered.length !== 1 ? "s" : ""} {search ? "matching" : "total"}</p>
    </div>
  );
}
