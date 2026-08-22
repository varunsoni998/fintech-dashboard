import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import {
  IndianRupee, TrendingUp, TrendingDown, Target, PieChart,
  DollarSign, Calendar, CheckCircle, Clock, Briefcase, Database,
} from "lucide-react";
import { useEffect, useState } from "react";

const API = "https://fintech-dashboard-61vh.onrender.com/api";

interface FinanceData {
  month_start: string; month_end: string;
  revenue: { realized: number; pending: number; pipeline_total: number };
  expenses: { supplier_cost: number; overhead: number; refunds: number; total: number };
  profit: { gross_profit: number; profit_margin: number };
  bookings: { total: number; confirmed: number; conversion_rate: number };
  targets: {
    target_revenue: number; target_bookings: number; target_profit_margin: number;
    revenue_variance: number; revenue_variance_pct: number;
    bookings_variance: number; margin_variance: number;
  };
  generated_at: string;
}

interface FinanceEntry {
  id: string; trip_name: string; client_name: string;
  revenue: number; expense: number; profit: number; booking_date: string;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const percent = (n: number) => `${(n * 100).toFixed(1)}%`;

const progress = (value: number, target: number) => {
  if (!target) return 0;
  return Math.min((value / target) * 100, 100);
};

// Empty state shown when backend returns {} or no data
function EmptyState() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center">
          <Database className="h-10 w-10 text-muted-foreground opacity-40" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">No Finance Data Yet</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            The Finance KPI dashboard will populate once your n8n Finance KPI workflow runs
            and posts data to the backend.
          </p>
          <p className="text-xs text-muted-foreground mt-3 opacity-60">
            Connect your n8n workflow to{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {API}/finance-kpis
            </code>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-sm w-full mt-2">
          {["Revenue", "Expenses", "Profit", "Bookings"].map(label => (
            <div key={label} className="rounded-xl bg-card border p-4 text-left opacity-40">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="h-6 w-20 bg-muted rounded mt-2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function FinanceKPIs() {
  const [finance, setFinance]   = useState<FinanceData | null>(null);
  const [entries, setEntries]   = useState<FinanceEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [isEmpty, setIsEmpty]   = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    setIsEmpty(false);
    try {
      const [kpiRes, entryRes] = await Promise.all([
        fetch(`${API}/finance-kpis/latest`),
        fetch(`${API}/finance-entries`),
      ]);

      const kpi          = await kpiRes.json();
      const transactions = await entryRes.json();

      // Backend returns {} when no data exists yet
      if (!kpi || !kpi.revenue) {
        setIsEmpty(true);
        return;
      }

      setFinance(kpi);
      setEntries(Array.isArray(transactions) ? transactions : []);
    } catch (err) {
      console.error("Finance load failed:", err);
      setIsEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-40 gap-4 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
          <p className="text-sm">Loading Finance Dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isEmpty || !finance) return <EmptyState />;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        <motion.div {...fade(0)}>
          <h1 className="text-3xl font-serif">Finance Dashboard</h1>
          <p className="text-muted-foreground mt-2">Revenue, expenses, margins and business performance</p>
        </motion.div>

        {/* KPI CARDS */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Revenue",       value: currency(finance.revenue.realized),    icon: IndianRupee, bg: "bg-green-100",  color: "text-green-600"  },
            { label: "Expenses",      value: currency(finance.expenses.total),       icon: TrendingDown, bg: "bg-red-100",  color: "text-red-600"    },
            { label: "Gross Profit",  value: currency(finance.profit.gross_profit),  icon: TrendingUp,  bg: "bg-blue-100", color: "text-blue-600"   },
            { label: "Profit Margin", value: percent(finance.profit.profit_margin),  icon: PieChart,    bg: "bg-yellow-100", color: "text-yellow-600" },
          ].map(({ label, value, icon: Icon, bg, color }, i) => (
            <motion.div key={label} {...fade(0.1 + i * 0.05)} className="rounded-2xl bg-card border shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <h2 className="text-3xl font-bold mt-3">{value}</h2>
                </div>
                <div className={`h-12 w-12 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* SECOND ROW */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Bookings",   value: String(finance.bookings.total),                     icon: Briefcase,   color: "text-primary"    },
            { label: "Confirmed",  value: String(finance.bookings.confirmed),                  icon: CheckCircle, color: "text-green-600"  },
            { label: "Conversion", value: percent(finance.bookings.conversion_rate),           icon: Target,      color: "text-blue-600"   },
            { label: "Updated",    value: new Date(finance.generated_at).toLocaleDateString(), icon: Calendar,    color: "text-accent"     },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <motion.div key={label} {...fade(0.3 + i * 0.05)} className="rounded-2xl bg-card border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <h2 className="text-2xl font-bold mt-3">{value}</h2>
                </div>
                <Icon className={`h-7 w-7 ${color}`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* PROGRESS */}
        <div className="grid lg:grid-cols-3 gap-6">
          {[
            { title: "Revenue Target",       current: finance.revenue.realized,       target: finance.targets.target_revenue,       fmt: currency, color: "bg-green-600"  },
            { title: "Booking Target",       current: finance.bookings.total,          target: finance.targets.target_bookings,      fmt: String,   color: "bg-blue-600"   },
            { title: "Profit Margin Target", current: finance.profit.profit_margin,    target: finance.targets.target_profit_margin, fmt: percent,  color: "bg-yellow-500" },
          ].map(({ title, current, target, fmt, color }, i) => (
            <motion.div key={title} {...fade(0.5 + i * 0.05)} className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold text-lg mb-6">{title}</h3>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">{fmt(current as any)}</span>
                <span className="text-sm font-medium">{fmt(target as any)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div className={`${color} h-3 rounded-full transition-all duration-700`}
                  style={{ width: `${progress(current, target)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-3">{progress(current, target).toFixed(1)}% Complete</p>
            </motion.div>
          ))}
        </div>

        {/* BREAKDOWN */}
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div {...fade(0.65)} className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-6">Revenue Breakdown</h3>
            <div className="space-y-5">
              {[
                { label: "Realized Revenue", value: finance.revenue.realized,       icon: IndianRupee, color: "text-green-600"  },
                { label: "Pending Revenue",  value: finance.revenue.pending,         icon: Clock,       color: "text-yellow-600" },
                { label: "Pipeline Value",   value: finance.revenue.pipeline_total,  icon: TrendingUp,  color: "text-blue-600"   },
              ].map(({ label, value, icon: Icon, color }, i, arr) => (
                <div key={label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-2xl font-bold mt-1">{currency(value)}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${color}`} />
                  </div>
                  {i < arr.length - 1 && <hr className="mt-4" />}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.7)} className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-6">Expense Breakdown</h3>
            <div className="space-y-5">
              {[
                { label: "Supplier Cost",    value: finance.expenses.supplier_cost, icon: DollarSign,  color: "text-red-500"    },
                { label: "Operational Cost", value: finance.expenses.overhead,       icon: Briefcase,   color: "text-orange-500" },
                { label: "Refunds",          value: finance.expenses.refunds,        icon: TrendingDown, color: "text-red-600"  },
                { label: "Total Expenses",   value: finance.expenses.total,          icon: PieChart,    color: "text-red-600"    },
              ].map(({ label, value, icon: Icon, color }, i, arr) => (
                <div key={label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className={`text-2xl font-bold mt-1 ${label === "Total Expenses" ? "text-red-600" : ""}`}>{currency(value)}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${color}`} />
                  </div>
                  {i < arr.length - 1 && <hr className="mt-4" />}
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* SUMMARY */}
        <motion.div {...fade(0.75)} className="rounded-2xl border bg-card p-6">
          <h3 className="text-lg font-semibold mb-6">Monthly Financial Summary</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { label: "Revenue Variance",  value: currency(finance.targets.revenue_variance),    sub: `${finance.targets.revenue_variance_pct.toFixed(1)}%` },
              { label: "Booking Variance",  value: String(finance.targets.bookings_variance),       sub: "vs target" },
              { label: "Margin Variance",   value: percent(finance.targets.margin_variance),         sub: "vs target" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl bg-muted p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <h2 className="text-2xl font-bold mt-3">{value}</h2>
                <p className="text-xs mt-2 text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* TRANSACTIONS */}
        <motion.div {...fade(0.8)} className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-6 py-5 border-b">
            <h3 className="text-lg font-semibold">Recent Financial Transactions</h3>
            <p className="text-sm text-muted-foreground mt-1">Latest bookings and financial performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40">
                <tr>
                  {["Trip","Client","Revenue","Expense","Profit","Date"].map(h => (
                    <th key={h} className={`px-6 py-4 text-sm font-semibold ${["Revenue","Expense","Profit"].includes(h) ? "text-right" : h === "Date" ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0
                  ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet.</td></tr>
                  : entries.map(e => (
                    <tr key={e.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-5 font-medium">{e.trip_name}</td>
                      <td className="px-6 py-5">{e.client_name}</td>
                      <td className="px-6 py-5 text-right text-green-600 font-semibold">{currency(e.revenue)}</td>
                      <td className="px-6 py-5 text-right text-red-500 font-semibold">{currency(e.expense)}</td>
                      <td className="px-6 py-5 text-right font-bold">{currency(e.profit)}</td>
                      <td className="px-6 py-5 text-center text-muted-foreground">{new Date(e.booking_date).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* FOOTER */}
        <motion.div {...fade(0.85)} className="rounded-2xl border bg-card p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Finance Dashboard</h3>
              <p className="text-sm text-muted-foreground mt-1">Updated from your n8n Finance KPI workflow.</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Last Updated</p>
              <p className="font-medium mt-1">{new Date(finance.generated_at).toLocaleString("en-IN")}</p>
            </div>
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}