import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Globe, TrendingUp, Eye, MousePointerClick, Clock, ArrowUpRight } from "lucide-react";

const trafficData = [
  { day: "Mon", visitors: 420, pageViews: 1240 },
  { day: "Tue", visitors: 380, pageViews: 980 },
  { day: "Wed", visitors: 510, pageViews: 1450 },
  { day: "Thu", visitors: 470, pageViews: 1300 },
  { day: "Fri", visitors: 600, pageViews: 1680 },
  { day: "Sat", visitors: 350, pageViews: 870 },
  { day: "Sun", visitors: 290, pageViews: 720 },
];

const sourceData = [
  { name: "Organic Search", value: 42, color: "hsl(36 80% 56%)" },
  { name: "Social Media", value: 28, color: "hsl(210 80% 56%)" },
  { name: "Direct", value: 18, color: "hsl(152 56% 46%)" },
  { name: "Referral", value: 12, color: "hsl(280 60% 60%)" },
];

const conversionData = [
  { month: "Sep", rate: 8.2 },
  { month: "Oct", rate: 9.5 },
  { month: "Nov", rate: 10.1 },
  { month: "Dec", rate: 11.8 },
  { month: "Jan", rate: 12.4 },
  { month: "Feb", rate: 13.1 },
];

const topPages = [
  { page: "/rajasthan-heritage-tour", views: 1240, bounce: "32%" },
  { page: "/kerala-backwaters", views: 980, bounce: "28%" },
  { page: "/golden-triangle", views: 870, bounce: "35%" },
  { page: "/goa-luxury-retreat", views: 720, bounce: "41%" },
  { page: "/himachal-adventure", views: 650, bounce: "38%" },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const Analytics = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Website performance and traffic insights</p>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Total Visitors", value: "12,847", change: "+14% vs last week", icon: Eye },
            { title: "Page Views", value: "38,420", change: "+22% vs last week", icon: Globe },
            { title: "Avg. Session", value: "3m 42s", change: "+8% vs last week", icon: Clock },
            { title: "Click Rate", value: "4.8%", change: "+0.6% vs last week", icon: MousePointerClick },
          ].map((stat, i) => (
            <motion.div key={stat.title} {...fade(i * 0.05)} className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                  <p className="text-2xl font-serif mt-1 text-card-foreground">{stat.value}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-accent" />
                </div>
              </div>
              <p className="text-xs mt-3 font-medium text-success">{stat.change}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div {...fade(0.2)} className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Weekly Traffic</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trafficData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(220 40% 14%)", border: "none", borderRadius: "8px", color: "hsl(40 30% 96%)", fontSize: "12px" }} />
                <Bar dataKey="visitors" fill="hsl(36 80% 56%)" radius={[4, 4, 0, 0]} name="Visitors" />
                <Bar dataKey="pageViews" fill="hsl(210 80% 56%)" radius={[4, 4, 0, 0]} name="Page Views" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div {...fade(0.25)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {sourceData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(220 40% 14%)", border: "none", borderRadius: "8px", color: "hsl(40 30% 96%)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {sourceData.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.name}</span>
                  </div>
                  <span className="font-medium text-card-foreground">{s.value}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Conversion + Top Pages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div {...fade(0.3)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Conversion Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={conversionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(220 10% 46%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(220 40% 14%)", border: "none", borderRadius: "8px", color: "hsl(40 30% 96%)", fontSize: "12px" }} formatter={(v: number) => [`${v}%`, "Rate"]} />
                <Line type="monotone" dataKey="rate" stroke="hsl(152 56% 46%)" strokeWidth={2.5} dot={{ fill: "hsl(152 56% 46%)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div {...fade(0.35)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Top Pages</h3>
            <div className="space-y-3">
              {topPages.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowUpRight className="h-3.5 w-3.5 text-accent shrink-0" />
                    <span className="text-sm text-card-foreground truncate">{p.page}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-muted-foreground">{p.views} views</span>
                    <span className="text-xs text-muted-foreground">{p.bounce} bounce</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
