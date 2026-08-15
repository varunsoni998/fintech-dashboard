import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  Globe, Eye, MousePointer, Clock, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Tablet, RefreshCw, Loader2, AlertCircle,
  TrendingUp, Users,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect, useCallback } from "react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface OverviewMetric {
  value: number;
  prev: number;
}

interface AnalyticsData {
  pageViews: OverviewMetric;
  activeUsers: OverviewMetric;
  avgSessionSec: OverviewMetric;
  sessions: OverviewMetric;
  topPages: { path: string; views: number; users: number }[];
  devices: { name: string; sessions: number; pct: number }[];
  countries: { name: string; sessions: number; pct: number }[];
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const pct = (curr: number, prev: number) => {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
};

const fmtSec = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const fmtNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

/* ─────────────────────────────────────────────
   PARSE GA4 RESPONSE
───────────────────────────────────────────── */
function parseGA4(raw: any): AnalyticsData {
  const { overview, pages, geo } = raw;

  // Overview — row 0 = current period, row 1 = previous period
  const getMetric = (rows: any[], rowIdx: number, metIdx: number) =>
    parseFloat(rows?.[rowIdx]?.metricValues?.[metIdx]?.value ?? "0");

  // overview report has no dimensions so rows are just [current, previous] date ranges
  // actually GA4 returns one row per dimension combo; with no dimensions it's a single row
  // but with dateRanges[2] it returns 2 rows (one per range)
  const ovRows = overview?.rows ?? [];
  const curr = (i: number) => parseFloat(ovRows[0]?.metricValues?.[i]?.value ?? "0");
  const prev = (i: number) => parseFloat(ovRows[1]?.metricValues?.[i]?.value ?? "0");

  // Pages
  const topPages = (pages?.rows ?? []).slice(0, 8).map((r: any) => ({
    path: r.dimensionValues?.[0]?.value ?? "—",
    views: parseInt(r.metricValues?.[0]?.value ?? "0"),
    users: parseInt(r.metricValues?.[1]?.value ?? "0"),
  }));

  // Devices & countries from geo report
  const geoRows: any[] = geo?.rows ?? [];
  const deviceMap: Record<string, number> = {};
  const countryMap: Record<string, number> = {};

  for (const row of geoRows) {
    const country = row.dimensionValues?.[0]?.value ?? "Unknown";
    const device  = row.dimensionValues?.[1]?.value ?? "Unknown";
    const sessions = parseInt(row.metricValues?.[0]?.value ?? "0");
    deviceMap[device]   = (deviceMap[device]   ?? 0) + sessions;
    countryMap[country] = (countryMap[country] ?? 0) + sessions;
  }

  const totalDeviceSessions = Object.values(deviceMap).reduce((a, b) => a + b, 0) || 1;
  const totalCountrySessions = Object.values(countryMap).reduce((a, b) => a + b, 0) || 1;

  const devices = Object.entries(deviceMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, sessions]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      sessions,
      pct: Math.round((sessions / totalDeviceSessions) * 100),
    }));

  const countries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, sessions]) => ({
      name,
      sessions,
      pct: Math.round((sessions / totalCountrySessions) * 100),
    }));

  return {
    pageViews:    { value: curr(0), prev: prev(0) },
    activeUsers:  { value: curr(1), prev: prev(1) },
    avgSessionSec:{ value: curr(2), prev: prev(2) },
    sessions:     { value: curr(3), prev: prev(3) },
    topPages,
    devices,
    countries,
  };
}

/* ─────────────────────────────────────────────
   DEVICE ICON
───────────────────────────────────────────── */
const DeviceIcon = ({ name }: { name: string }) => {
  const n = name.toLowerCase();
  if (n.includes("mobile"))  return <Smartphone className="h-3.5 w-3.5" />;
  if (n.includes("tablet"))  return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
};

/* ═══════════════════════════════════════════
   MAIN
═══════════════════════════════════════════ */
const WebAnalytics = () => {
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: raw, error: fnErr } = await supabase.functions.invoke("ga4-analytics");
      if (fnErr) throw new Error(fnErr.message);
      if (raw?.error) throw new Error(raw.error);
      setData(parseGA4(raw));
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Stats cards ── */
  const stats = data ? [
    {
      label: "Page Views",
      value: fmtNum(data.pageViews.value),
      icon: Eye,
      change: pct(data.pageViews.value, data.pageViews.prev),
      sub: "vs last 30 days",
    },
    {
      label: "Active Users",
      value: fmtNum(data.activeUsers.value),
      icon: Users,
      change: pct(data.activeUsers.value, data.activeUsers.prev),
      sub: "vs last 30 days",
    },
    {
      label: "Avg. Session",
      value: fmtSec(data.avgSessionSec.value),
      icon: Clock,
      change: pct(data.avgSessionSec.value, data.avgSessionSec.prev),
      sub: "vs last 30 days",
    },
    {
      label: "Sessions",
      value: fmtNum(data.sessions.value),
      icon: TrendingUp,
      change: pct(data.sessions.value, data.sessions.prev),
      sub: "vs last 30 days",
    },
  ] : [];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Web Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live data · last 30 days
              {lastUpdated && (
                <span className="ml-2 text-[11px]">
                  · updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors self-start disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">Failed to load analytics</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <button onClick={fetchData} className="text-xs text-red-600 underline mt-1">Try again</button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Fetching live analytics…</span>
          </div>
        )}

        {/* Content */}
        {data && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s, i) => {
                const up = s.change >= 0;
                return (
                  <motion.div key={s.label} {...fade(i * 0.05)}
                    className="rounded-xl border bg-card p-4 shadow-card">
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className="h-4 w-4 text-accent" />
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    </div>
                    <p className="text-xl font-serif text-card-foreground">{s.value}</p>
                    <p className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${up ? "text-green-600" : "text-red-500"}`}>
                      {up
                        ? <ArrowUpRight className="h-3 w-3" />
                        : <ArrowDownRight className="h-3 w-3" />}
                      {up ? "+" : ""}{s.change}% {s.sub}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top Pages */}
              <motion.div {...fade(0.15)}
                className="lg:col-span-2 rounded-xl border bg-card shadow-card overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-serif text-lg text-card-foreground">Top Pages</h3>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Last 30 days
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      {["Page", "Page Views", "Unique Users"].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-xs text-muted-foreground">
                          No page data yet — May still be collecting.
                        </td>
                      </tr>
                    ) : data.topPages.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-card-foreground text-xs font-mono">{p.path}</td>
                        <td className="px-4 py-3 text-xs text-card-foreground">{p.views.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-xs text-card-foreground">{p.users.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Devices */}
                <motion.div {...fade(0.2)} className="rounded-xl border bg-card p-5 shadow-card">
                  <h3 className="font-serif text-base text-card-foreground mb-3">Devices</h3>
                  {data.devices.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No device data yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.devices.map(d => (
                        <div key={d.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <DeviceIcon name={d.name} />{d.name}
                            </span>
                            <span className="font-medium text-card-foreground">{d.pct}%</span>
                          </div>
                          <Progress value={d.pct} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Countries */}
                <motion.div {...fade(0.25)} className="rounded-xl border bg-card p-5 shadow-card">
                  <h3 className="font-serif text-base text-card-foreground mb-3">Top Countries</h3>
                  {data.countries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No country data yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.countries.map((c, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">{c.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-card-foreground">
                                {c.sessions.toLocaleString("en-IN")}
                              </span>
                              <span className="text-[10px] text-muted-foreground w-8 text-right">
                                {c.pct}%
                              </span>
                            </div>
                          </div>
                          <Progress value={c.pct} className="h-1" />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>

            {/* Data notice */}
           

          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WebAnalytics;