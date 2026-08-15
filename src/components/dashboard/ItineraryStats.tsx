import { motion } from "framer-motion";
import { Map, Clock, Send, Star } from "lucide-react";

const stats = [
  { label: "Generated", value: "34", icon: Map, sub: "this month" },
  { label: "Avg. Time", value: "4.2m", icon: Clock, sub: "per itinerary" },
  { label: "Sent", value: "28", icon: Send, sub: "to clients" },
  { label: "Rating", value: "4.8", icon: Star, sub: "client avg." },
];

const recent = [
  { client: "Sharma Family", dest: "Rajasthan", days: 7, status: "Delivered" },
  { client: "Patel Group", dest: "Kerala", days: 5, status: "In Progress" },
  { client: "Gupta Couple", dest: "Goa + Hampi", days: 10, status: "Delivered" },
];

export function ItineraryStats() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="rounded-xl border bg-card p-5 shadow-card"
    >
      <h3 className="font-serif text-lg text-card-foreground mb-4">Rag</h3>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {stats.map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-lg font-semibold text-card-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Recent</p>
      <div className="space-y-2">
        {recent.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
            <div>
              <p className="font-medium text-card-foreground">{r.client}</p>
              <p className="text-xs text-muted-foreground">{r.dest} · {r.days} days</p>
            </div>
            <span className={`text-xs font-medium ${r.status === "Delivered" ? "text-success" : "text-warning"}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
