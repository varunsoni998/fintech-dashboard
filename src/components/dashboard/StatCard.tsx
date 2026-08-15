import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  delay?: number;
}

export function StatCard({ title, value, change, changeType, icon: Icon, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-xl border bg-card p-5 shadow-card hover:shadow-elevated transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-serif mt-1 text-card-foreground">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      </div>
      <p className={`text-xs mt-3 font-medium ${
        changeType === "positive" ? "text-success" : changeType === "negative" ? "text-destructive" : "text-muted-foreground"
      }`}>
        {change}
      </p>
    </motion.div>
  );
}
