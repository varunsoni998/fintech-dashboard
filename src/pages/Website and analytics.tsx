import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import { Globe, Eye, MousePointer, Clock, TrendingUp, Plus, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const pages = [
  { name: "Home", path: "/", visits: 4820, bounce: "32%", avgTime: "3:24", status: "Live" },
  { name: "Tour Packages", path: "/packages", visits: 3210, bounce: "28%", avgTime: "4:52", status: "Live" },
  { name: "Rajasthan Heritage", path: "/rajasthan", visits: 1840, bounce: "21%", avgTime: "5:10", status: "Live" },
  { name: "Kerala Backwaters", path: "/kerala", visits: 1560, bounce: "25%", avgTime: "4:38", status: "Live" },
  { name: "Contact Us", path: "/contact", visits: 980, bounce: "45%", avgTime: "1:55", status: "Live" },
  { name: "Blog", path: "/blog", visits: 720, bounce: "38%", avgTime: "6:20", status: "Draft" },
];

const seoMetrics = [
  { label: "Domain Authority", value: 42, max: 100 },
  { label: "Page Speed Score", value: 78, max: 100 },
  { label: "SEO Health", value: 85, max: 100 },
  { label: "Mobile Friendly", value: 92, max: 100 },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const Website = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Website Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor pages, SEO health, and site performance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Sync
            </Button>
            <Button size="sm" className="gap-2 bg-gradient-gold text-accent-foreground hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> New Page
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Monthly Visitors", value: "14.2K", icon: Eye, sub: "+12% vs last month" },
            { label: "Avg. Session", value: "4:18", icon: Clock, sub: "minutes" },
            { label: "Click Rate", value: "6.4%", icon: MousePointer, sub: "on CTAs" },
            { label: "Organic Growth", value: "+18%", icon: TrendingUp, sub: "from SEO" },
          ].map((s, i) => (
            <motion.div key={s.label} {...fade(i * 0.05)} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-serif text-card-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* SEO Metrics */}
          <motion.div {...fade(0.15)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">SEO Health</h3>
            <div className="space-y-4">
              {seoMetrics.map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium text-card-foreground">{m.value}/{m.max}</span>
                  </div>
                  <Progress value={m.value} className="h-1.5" />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Pages Table */}
          <motion.div {...fade(0.2)} className="lg:col-span-2 rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-serif text-lg text-card-foreground">Pages</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Page", "Visits", "Bounce Rate", "Avg Time", "Status"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-card-foreground text-xs">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">{p.path} <ExternalLink className="h-2.5 w-2.5" /></p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-card-foreground">{p.visits.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-card-foreground">{p.bounce}</td>
                    <td className="px-4 py-3 text-xs text-card-foreground">{p.avgTime}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.status === "Live" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Website;