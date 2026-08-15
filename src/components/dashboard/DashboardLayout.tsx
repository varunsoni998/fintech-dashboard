import { SidebarTrigger } from "../../components/ui/sidebar";
import { Bell, RefreshCw } from "lucide-react";
import { useState, useCallback } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
    window.location.reload();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: "#E8E8F2" }}>
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-5 border-b-0"
        style={{ background: "#E8E8F2", borderBottom: "none" }}>
        <SidebarTrigger
          className="rounded-xl transition-all"
          style={{
            background: "#E8E8F2",
            boxShadow: "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF",
            color: "#9090A8",
            border: "none",
            width: 36,
            height: 36,
          }}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="rounded-xl flex items-center justify-center transition-all"
            style={{
              background: "#E8E8F2",
              boxShadow: "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF",
              color: "#9090A8",
              border: "none",
              width: 36,
              height: 36,
            }}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            className="rounded-xl flex items-center justify-center transition-all"
            style={{
              background: "#E8E8F2",
              boxShadow: "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF",
              color: "#9090A8",
              border: "none",
              width: 36,
              height: 36,
            }}
          >
            <Bell className="h-4 w-4" />
          </button>
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #7B8FE0, #5B6FD0)",
              boxShadow: "3px 3px 7px #C4C4D4, -2px -2px 5px #FFFFFF",
            }}
          >
            VD
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}