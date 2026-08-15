import { motion } from "framer-motion";
import { Instagram, Linkedin, FileText, Eye } from "lucide-react";

const upcoming = [
  { platform: "Instagram", icon: Instagram, title: "Jaipur Palace Photo Set", date: "Feb 25", status: "Scheduled", statusColor: "text-success" },
  { platform: "Blog", icon: FileText, title: "Hidden Gems of Kerala Backwaters", date: "Feb 27", status: "Draft", statusColor: "text-warning" },
  { platform: "LinkedIn", icon: Linkedin, title: "Q1 Travel Trends in India", date: "Mar 1", status: "In Review", statusColor: "text-info" },
  { platform: "Instagram", icon: Instagram, title: "Udaipur Lake Stories", date: "Mar 3", status: "Planned", statusColor: "text-muted-foreground" },
];

export function ContentCalendar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-xl border bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg text-card-foreground">Content Calendar</h3>
        <span className="text-xs text-muted-foreground">This week</span>
      </div>
      <div className="space-y-3">
        {upcoming.map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <item.icon className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.platform} · {item.date}</p>
            </div>
            <span className={`text-xs font-medium ${item.statusColor}`}>{item.status}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
