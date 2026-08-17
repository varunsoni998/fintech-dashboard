import { Users, Map, TrendingUp, IndianRupee, Globe, Mail, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { RevenueChart } from "../components/dashboard/RevenueChart";
import { LeadPipeline } from "../components/dashboard/LeadPipeline";
import { RecentActivity } from "../components/dashboard/RecentActivity";

const neu = {
  background: "#E8E8F2",
  boxShadow: "6px 6px 14px #C4C4D4, -6px -6px 14px #FFFFFF",
  borderRadius: "1rem",
  border: "none",
};

const neuSm = {
  background: "#E8E8F2",
  boxShadow: "3px 3px 8px #C4C4D4, -3px -3px 8px #FFFFFF",
  borderRadius: "0.75rem",
  border: "none",
};

const neuInset = {
  background: "#E8E8F2",
  boxShadow: "inset 4px 4px 10px #C4C4D4, inset -4px -4px 10px #FFFFFF",
  borderRadius: "1rem",
  border: "none",
};

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
  iconColor: string;
  delay?: number;
}

function StatCard({ title, value, change, positive, icon: Icon, iconColor }: StatCardProps) {
  return (
    <div className="p-5" style={neu}>
      <div className="flex items-start justify-between mb-4">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ ...neuSm, color: iconColor }}
        >
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
        <span
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg"
          style={{
            ...{ background: "#E8E8F2", boxShadow: "inset 2px 2px 5px #C4C4D4, inset -2px -2px 5px #FFFFFF", borderRadius: "0.5rem" },
            color: positive ? "#52A882" : "#E05A5A",
          }}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {change}
        </span>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color: "#3D3D5C" }}>{value}</p>
      <p className="text-xs tracking-wide uppercase" style={{ color: "#9090A8" }}>{title}</p>
    </div>
  );
}

const Index = () => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#3D3D5C" }}>
              {greeting}, Varun 👋
            </h1>
            <p className="text-sm mt-1" style={{ color: "#9090A8" }}>
              Here's your business overview for today
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium" style={{ color: "#3D3D5C" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#9090A8" }}>Live data</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard title="Total Leads" value="142" change="+18%" positive icon={Users} iconColor="#6B7FD4" />
          <StatCard title="Active Itineraries" value="34" change="+6" positive icon={Map} iconColor="#52A882" />
          <StatCard title="Conversion Rate" value="12.4%" change="+2.1%" positive icon={TrendingUp} iconColor="#9B8FE8" />
          <StatCard title="Revenue (MTD)" value="₹4.8L" change="-8%" positive={false} icon={IndianRupee} iconColor="#E07A5A" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div style={neu} className="p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#3D3D5C" }}>Revenue Overview</h3>
              <RevenueChart />
            </div>
            <div style={neu} className="p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#3D3D5C" }}>Lead Pipeline</h3>
              <LeadPipeline />
            </div>
          </div>

          <div className="space-y-5">
            {/* Quick stats */}
            {[
              { label: "Website Traffic", value: "2,847", sub: "visitors this week", icon: Globe, color: "#6B7FD4" },
              { label: "Email Campaigns", value: "89%", sub: "delivery rate", icon: Mail, color: "#52A882" },
              { label: "Team Activity", value: "5", sub: "members active today", icon: Users, color: "#9B8FE8" },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <div key={label} className="p-4 flex items-center gap-4" style={neu}>
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ ...neuInset, color }}>
                  <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: "#3D3D5C" }}>{value}</p>
                  <p className="text-xs font-medium" style={{ color: "#3D3D5C" }}>{label}</p>
                  <p className="text-[10px]" style={{ color: "#9090A8" }}>{sub}</p>
                </div>
              </div>
            ))}

            {/* Recent Activity */}
            <div style={neu} className="p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#3D3D5C" }}>Recent Activity</h3>
              <RecentActivity />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
