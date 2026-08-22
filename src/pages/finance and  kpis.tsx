import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Target,
  PieChart,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  Briefcase,
} from "lucide-react";

import { useEffect, useState } from "react";

interface FinanceData {
  month_start: string;
  month_end: string;

  revenue: {
    realized: number;
    pending: number;
    pipeline_total: number;
  };

  expenses: {
    supplier_cost: number;
    overhead: number;
    refunds: number;
    total: number;
  };

  profit: {
    gross_profit: number;
    profit_margin: number;
  };

  bookings: {
    total: number;
    confirmed: number;
    conversion_rate: number;
  };

  targets: {
    target_revenue: number;
    target_bookings: number;
    target_profit_margin: number;

    revenue_variance: number;
    revenue_variance_pct: number;

    bookings_variance: number;

    margin_variance: number;
  };

  generated_at: string;
}

interface FinanceEntry {
  id: string;

  trip_name: string;

  client_name: string;

  revenue: number;

  expense: number;

  profit: number;

  booking_date: string;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },

  animate: { opacity: 1, y: 0 },

  transition: {
    duration: 0.4,
    delay,
  },
});

const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const percent = (n: number) => `${(n * 100).toFixed(1)}%`;

const progress = (value: number, target: number) => {
  if (!target) return 0;

  return Math.min((value / target) * 100, 100);
};

export default function FinanceKPIs() {
  const [finance, setFinance] = useState<FinanceData | null>(null);

  const [entries, setEntries] = useState<FinanceEntry[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [kpiRes, entryRes] = await Promise.all([
        fetch("https://fintech-dashboard-61vh.onrender.com/api/finance-kpis/latest"),
        fetch("https://fintech-dashboard-61vh.onrender.com/api/finance-entries"),
      ]);

      const kpi = await kpiRes.json();

      const transactions = await entryRes.json();

      setFinance(kpi);

      setEntries(transactions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-40 text-muted-foreground">
          Loading Finance Dashboard...
        </div>
      </DashboardLayout>
    );
  }

  if (!finance) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-40 text-red-500">
          Unable to load finance dashboard.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        <motion.div {...fade(0)}>

          <h1 className="text-3xl font-serif">
            Finance Dashboard
          </h1>

          <p className="text-muted-foreground mt-2">
            Revenue, expenses, margins and business performance
          </p>

        </motion.div>
        {/* KPI CARDS */}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

          <motion.div
            {...fade(0.1)}
            className="rounded-2xl bg-card border shadow-sm p-6"
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Revenue
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {currency(finance.revenue.realized)}
                </h2>

              </div>

              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">

                <IndianRupee className="h-6 w-6 text-green-600"/>

              </div>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.15)}
            className="rounded-2xl bg-card border shadow-sm p-6"
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Expenses
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {currency(finance.expenses.total)}
                </h2>

              </div>

              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">

                <TrendingDown className="h-6 w-6 text-red-600"/>

              </div>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.2)}
            className="rounded-2xl bg-card border shadow-sm p-6"
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Gross Profit
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {currency(finance.profit.gross_profit)}
                </h2>

              </div>

              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">

                <TrendingUp className="h-6 w-6 text-blue-600"/>

              </div>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.25)}
            className="rounded-2xl bg-card border shadow-sm p-6"
          >
            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Profit Margin
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {percent(finance.profit.profit_margin)}
                </h2>

              </div>

              <div className="h-12 w-12 rounded-xl bg-yellow-100 flex items-center justify-center">

                <PieChart className="h-6 w-6 text-yellow-600"/>

              </div>

            </div>

          </motion.div>

        </div>

        {/* SECOND ROW */}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

          <motion.div
            {...fade(0.3)}
            className="rounded-2xl bg-card border p-6"
          >

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Bookings
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {finance.bookings.total}
                </h2>

              </div>

              <Briefcase className="text-primary"/>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.35)}
            className="rounded-2xl bg-card border p-6"
          >

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Confirmed
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {finance.bookings.confirmed}
                </h2>

              </div>

              <CheckCircle className="text-green-600"/>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.4)}
            className="rounded-2xl bg-card border p-6"
          >

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Conversion
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  {percent(finance.bookings.conversion_rate)}
                </h2>

              </div>

              <Target className="text-blue-600"/>

            </div>

          </motion.div>

          <motion.div
            {...fade(0.45)}
            className="rounded-2xl bg-card border p-6"
          >

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm text-muted-foreground">
                  Updated
                </p>

                <h2 className="text-lg font-semibold mt-3">
                  {new Date(finance.generated_at).toLocaleDateString()}
                </h2>

              </div>

              <Calendar className="text-accent"/>

            </div>

          </motion.div>

        </div>
        {/* PROGRESS SECTION */}

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Revenue Progress */}

          <motion.div
            {...fade(0.5)}
            className="rounded-2xl border bg-card p-6"
          >

            <h3 className="font-semibold text-lg mb-6">
              Revenue Target
            </h3>

            <div className="flex justify-between mb-2">

              <span className="text-sm text-muted-foreground">
                {currency(finance.revenue.realized)}
              </span>

              <span className="text-sm font-medium">
                {currency(finance.targets.target_revenue)}
              </span>

            </div>

            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">

              <div
                className="bg-green-600 h-3 rounded-full transition-all duration-700"
                style={{
                  width: `${progress(
                    finance.revenue.realized,
                    finance.targets.target_revenue
                  )}%`,
                }}
              />

            </div>

            <p className="text-xs text-muted-foreground mt-3">

              {progress(
                finance.revenue.realized,
                finance.targets.target_revenue
              ).toFixed(1)}
              % Complete

            </p>

          </motion.div>

          {/* Booking Progress */}

          <motion.div
            {...fade(0.55)}
            className="rounded-2xl border bg-card p-6"
          >

            <h3 className="font-semibold text-lg mb-6">
              Booking Target
            </h3>

            <div className="flex justify-between mb-2">

              <span className="text-sm text-muted-foreground">

                {finance.bookings.total}

              </span>

              <span className="text-sm font-medium">

                {finance.targets.target_bookings}

              </span>

            </div>

            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">

              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-700"
                style={{
                  width: `${progress(
                    finance.bookings.total,
                    finance.targets.target_bookings
                  )}%`,
                }}
              />

            </div>

            <p className="text-xs text-muted-foreground mt-3">

              {progress(
                finance.bookings.total,
                finance.targets.target_bookings
              ).toFixed(1)}
              % Complete

            </p>

          </motion.div>

          {/* Profit Margin */}

          <motion.div
            {...fade(0.6)}
            className="rounded-2xl border bg-card p-6"
          >

            <h3 className="font-semibold text-lg mb-6">
              Profit Margin Target
            </h3>

            <div className="flex justify-between mb-2">

              <span className="text-sm text-muted-foreground">

                {percent(finance.profit.profit_margin)}

              </span>

              <span className="text-sm font-medium">

                {percent(finance.targets.target_profit_margin)}

              </span>

            </div>

            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">

              <div
                className="bg-yellow-500 h-3 rounded-full transition-all duration-700"
                style={{
                  width: `${progress(
                    finance.profit.profit_margin,
                    finance.targets.target_profit_margin
                  )}%`,
                }}
              />

            </div>

            <p className="text-xs text-muted-foreground mt-3">

              {progress(
                finance.profit.profit_margin,
                finance.targets.target_profit_margin
              ).toFixed(1)}
              % Complete

            </p>

          </motion.div>

        </div>
        {/* BREAKDOWN SECTION */}

        <div className="grid lg:grid-cols-2 gap-6">

          {/* Revenue Breakdown */}

          <motion.div
            {...fade(0.65)}
            className="rounded-2xl border bg-card p-6"
          >

            <h3 className="text-lg font-semibold mb-6">
              Revenue Breakdown
            </h3>

            <div className="space-y-5">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Realized Revenue
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.revenue.realized)}
                  </p>

                </div>

                <IndianRupee className="h-8 w-8 text-green-600"/>

              </div>

              <hr/>

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Pending Revenue
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.revenue.pending)}
                  </p>

                </div>

                <Clock className="h-8 w-8 text-yellow-600"/>

              </div>

              <hr/>

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Pipeline Value
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.revenue.pipeline_total)}
                  </p>

                </div>

                <TrendingUp className="h-8 w-8 text-blue-600"/>

              </div>

            </div>

          </motion.div>

          {/* Expense Breakdown */}

          <motion.div
            {...fade(0.7)}
            className="rounded-2xl border bg-card p-6"
          >

            <h3 className="text-lg font-semibold mb-6">
              Expense Breakdown
            </h3>

            <div className="space-y-5">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Supplier Cost
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.expenses.supplier_cost)}
                  </p>

                </div>

                <DollarSign className="h-8 w-8 text-red-500"/>

              </div>

              <hr/>

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Operational Cost
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.expenses.overhead)}
                  </p>

                </div>

                <Briefcase className="h-8 w-8 text-orange-500"/>

              </div>

              <hr/>

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Refunds
                  </p>

                  <p className="text-2xl font-bold mt-1">
                    {currency(finance.expenses.refunds)}
                  </p>

                </div>

                <TrendingDown className="h-8 w-8 text-red-600"/>

              </div>

              <hr/>

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-muted-foreground">
                    Total Expenses
                  </p>

                  <p className="text-2xl font-bold mt-1 text-red-600">
                    {currency(finance.expenses.total)}
                  </p>

                </div>

                <PieChart className="h-8 w-8 text-red-600"/>

              </div>

            </div>

          </motion.div>

        </div>

        {/* FINANCIAL SUMMARY */}

        <motion.div
          {...fade(0.75)}
          className="rounded-2xl border bg-card p-6"
        >

          <h3 className="text-lg font-semibold mb-6">
            Monthly Financial Summary
          </h3>

          <div className="grid md:grid-cols-3 gap-6">

            <div className="rounded-xl bg-muted p-5">

              <p className="text-sm text-muted-foreground">
                Revenue Variance
              </p>

              <h2 className="text-2xl font-bold mt-3">

                {currency(finance.targets.revenue_variance)}

              </h2>

              <p className="text-xs mt-2 text-muted-foreground">

                {finance.targets.revenue_variance_pct.toFixed(1)}%

              </p>

            </div>

            <div className="rounded-xl bg-muted p-5">

              <p className="text-sm text-muted-foreground">
                Booking Variance
              </p>

              <h2 className="text-2xl font-bold mt-3">

                {finance.targets.bookings_variance}

              </h2>

            </div>

            <div className="rounded-xl bg-muted p-5">

              <p className="text-sm text-muted-foreground">
                Margin Variance
              </p>

              <h2 className="text-2xl font-bold mt-3">

                {percent(finance.targets.margin_variance)}

              </h2>

            </div>

          </div>

        </motion.div>
        {/* RECENT TRANSACTIONS */}

        <motion.div
          {...fade(0.8)}
          className="rounded-2xl border bg-card overflow-hidden"
        >

          <div className="px-6 py-5 border-b">

            <h3 className="text-lg font-semibold">
              Recent Financial Transactions
            </h3>

            <p className="text-sm text-muted-foreground mt-1">
              Latest bookings and financial performance
            </p>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-muted/40">

                <tr>

                  <th className="text-left px-6 py-4 text-sm font-semibold">
                    Trip
                  </th>

                  <th className="text-left px-6 py-4 text-sm font-semibold">
                    Client
                  </th>

                  <th className="text-right px-6 py-4 text-sm font-semibold">
                    Revenue
                  </th>

                  <th className="text-right px-6 py-4 text-sm font-semibold">
                    Expense
                  </th>

                  <th className="text-right px-6 py-4 text-sm font-semibold">
                    Profit
                  </th>

                  <th className="text-center px-6 py-4 text-sm font-semibold">
                    Date
                  </th>

                </tr>

              </thead>

              <tbody>

                {entries.length === 0 ? (

                  <tr>

                    <td
                      colSpan={6}
                      className="text-center py-12 text-muted-foreground"
                    >

                      No finance entries available.

                    </td>

                  </tr>

                ) : (

                  entries.map((entry) => (

                    <tr
                      key={entry.id}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >

                      <td className="px-6 py-5 font-medium">

                        {entry.trip_name}

                      </td>

                      <td className="px-6 py-5">

                        {entry.client_name}

                      </td>

                      <td className="px-6 py-5 text-right text-green-600 font-semibold">

                        {currency(entry.revenue)}

                      </td>

                      <td className="px-6 py-5 text-right text-red-500 font-semibold">

                        {currency(entry.expense)}

                      </td>

                      <td className="px-6 py-5 text-right font-bold">

                        {currency(entry.profit)}

                      </td>

                      <td className="px-6 py-5 text-center text-muted-foreground">

                        {new Date(entry.booking_date).toLocaleDateString(
                          "en-IN"
                        )}

                      </td>

                    </tr>

                  ))

                )}

              </tbody>

            </table>

          </div>

        </motion.div>
        {/* FOOTER */}

        <motion.div
          {...fade(0.85)}
          className="rounded-2xl border bg-card p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div>

              <h3 className="text-lg font-semibold">
                Finance Dashboard
              </h3>

              <p className="text-sm text-muted-foreground mt-1">
                Automatically updated from your n8n Finance KPI workflow.
              </p>

            </div>

            <div className="text-right">

              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Last Updated
              </p>

              <p className="font-medium mt-1">
                {new Date(finance.generated_at).toLocaleString("en-IN")}
              </p>

            </div>

          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}