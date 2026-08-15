import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const data = [
  { month: "Sep", revenue: 280000 },
  { month: "Oct", revenue: 420000 },
  { month: "Nov", revenue: 380000 },
  { month: "Dec", revenue: 520000 },
  { month: "Jan", revenue: 610000 },
  { month: "Feb", revenue: 480000 },
];

export function RevenueChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="rounded-xl border bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg text-card-foreground">Revenue</h3>
        <span className="text-xs text-muted-foreground">Last 6 months</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={32}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(40 15% 88%)" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(220 40% 14%)",
              border: "none",
              borderRadius: "8px",
              color: "hsl(40 30% 96%)",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]}
          />
          <Bar dataKey="revenue" fill="hsl(36 80% 56%)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
