import { motion } from "framer-motion";
import { Mail, MessageSquare, FileText, Map, Users } from "lucide-react";

const activities = [
  { icon: Users, text: "12 new leads imported from CSV", time: "2h ago", color: "text-info" },
  { icon: Map, text: "Itinerary generated for Sharma Family — Rajasthan 7D", time: "3h ago", color: "text-accent" },
  { icon: Mail, text: "Follow-up emails sent to 8 qualified leads", time: "5h ago", color: "text-success" },
  { icon: MessageSquare, text: "WhatsApp campaign delivered — 92% open rate", time: "8h ago", color: "text-warning" },
  { icon: FileText, text: "Blog published: 'Top 10 Heritage Stays in India'", time: "1d ago", color: "text-chart-4" },
  { icon: Map, text: "Itinerary PPT sent to Gupta family via email", time: "1d ago", color: "text-accent" },
];

export function RecentActivity() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border bg-card p-5 shadow-card"
    >
      <h3 className="font-serif text-lg text-card-foreground mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <activity.icon className={`h-4 w-4 ${activity.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-card-foreground leading-snug">{activity.text}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
