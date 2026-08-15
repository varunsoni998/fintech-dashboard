import { motion } from "framer-motion";

const stages = [
  { name: "New Leads", count: 42, color: "bg-info" },
  { name: "Contacted", count: 28, color: "bg-accent" },
  { name: "Qualified", count: 15, color: "bg-warning" },
  { name: "Proposal", count: 8, color: "bg-chart-4" },
  { name: "Booked", count: 5, color: "bg-success" },
];

const totalMax = Math.max(...stages.map((s) => s.count));

export function LeadPipeline() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-xl border bg-card p-5 shadow-card"
    >
      <h3 className="font-serif text-lg text-card-foreground mb-4">Lead Pipeline</h3>
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{stage.name}</span>
            <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(stage.count / totalMax) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className={`h-full rounded-full ${stage.color}`}
              />
            </div>
            <span className="text-sm font-semibold text-card-foreground w-8 text-right">
              {stage.count}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
