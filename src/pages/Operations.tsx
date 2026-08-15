import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import { Settings, Users, FolderOpen, CheckCircle2, Clock, AlertCircle, Calendar, MoreHorizontal } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";

const projects = [
  { name: "Sharma Rajasthan Tour", client: "Sharma Family", progress: 85, status: "On Track", dueDate: "Mar 5", tasks: { done: 12, total: 14 } },
  { name: "Patel Kerala Package", client: "Patel Group", progress: 40, status: "On Track", dueDate: "Mar 12", tasks: { done: 6, total: 15 } },
  { name: "Kapoor Wedding Udaipur", client: "Kapoor Family", progress: 20, status: "At Risk", dueDate: "Mar 8", tasks: { done: 3, total: 18 } },
  { name: "Reddy Anniversary Andaman", client: "Reddy Couple", progress: 100, status: "Completed", dueDate: "Feb 22", tasks: { done: 10, total: 10 } },
];

const teamMembers = [
  { name: "Anika Mehta", role: "Operations Lead", status: "online", tasks: 8 },
  { name: "Rahul Verma", role: "Travel Specialist", status: "online", tasks: 5 },
  { name: "Deepa Nair", role: "Content Manager", status: "away", tasks: 3 },
  { name: "Karan Bhat", role: "Client Relations", status: "online", tasks: 6 },
  { name: "Simran Kaur", role: "Marketing Executive", status: "offline", tasks: 2 },
];

const statusIcon: Record<string, React.ReactNode> = {
  "On Track": <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  "At Risk": <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
  Completed: <CheckCircle2 className="h-3.5 w-3.5 text-accent" />,
};

const memberStatusColor: Record<string, string> = {
  online: "bg-success",
  away: "bg-warning",
  offline: "bg-muted-foreground",
};

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const Operations = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">Client projects, team management, and workflows</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active Projects", value: "8", icon: FolderOpen },
            { label: "Team Members", value: "5", icon: Users },
            { label: "Tasks This Week", value: "24", icon: CheckCircle2 },
            { label: "Overdue Tasks", value: "2", icon: AlertCircle },
          ].map((s, i) => (
            <motion.div key={s.label} {...fade(i * 0.05)} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-serif text-card-foreground">{s.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects */}
          <motion.div {...fade(0.15)} className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-card-foreground">Active Projects</h3>
              <Button variant="outline" size="sm" className="gap-2">
                <FolderOpen className="h-3.5 w-3.5" /> View All
              </Button>
            </div>
            <div className="space-y-4">
              {projects.map((proj, i) => (
                <div key={i} className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {statusIcon[proj.status]}
                        <h4 className="text-sm font-semibold text-card-foreground">{proj.name}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{proj.client}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <Progress value={proj.progress} className="flex-1 h-1.5" />
                    <span className="text-xs font-medium text-card-foreground">{proj.progress}%</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {proj.tasks.done}/{proj.tasks.total} tasks
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Due {proj.dueDate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Team */}
          <motion.div {...fade(0.2)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Team</h3>
            <div className="space-y-3">
              {teamMembers.map((member, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="relative">
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-accent">
                      {member.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${memberStatusColor[member.status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{member.tasks} tasks</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Operations;
