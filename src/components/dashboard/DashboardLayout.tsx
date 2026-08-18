import { SidebarTrigger } from "../../components/ui/sidebar";
import { Bell, RefreshCw, CheckCheck, Info, AlertTriangle, X } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface Notification {
  id: number;
  type: "info" | "success" | "warning";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    type: "info",
    title: "New lead assigned",
    message: "A new lead from Rajesh Mehta has been assigned to you.",
    time: "2 min ago",
    read: false,
  },
  {
    id: 2,
    type: "success",
    title: "Itinerary approved",
    message: "Kerala Backwaters package itinerary was approved by the client.",
    time: "1 hr ago",
    read: false,
  },
  {
    id: 3,
    type: "warning",
    title: "Supplier response pending",
    message: "No response from TravelEase Suppliers for 48 hours.",
    time: "3 hr ago",
    read: false,
  },
  {
    id: 4,
    type: "info",
    title: "Campaign scheduled",
    message: "Diwali campaign has been queued and will go live at 9:00 AM.",
    time: "Yesterday",
    read: true,
  },
];

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

const typeStyles = {
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    bg: "#EEF1FB",
    color: "#5B6FD0",
  },
  success: {
    icon: <CheckCheck className="h-3.5 w-3.5" />,
    bg: "#EEFAF4",
    color: "#2E9E6B",
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    bg: "#FEF6EB",
    color: "#D48A2E",
  },
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const notifRef = useRef<HTMLDivElement>(null);

  const { user, profile } = useAuth();
  const initials = getInitials(profile?.full_name, user?.email);
  const displayName = profile?.full_name ?? user?.email ?? "User";

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
    window.location.reload();
  }, []);

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const markRead = (id: number) =>
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

  const dismiss = (id: number) =>
    setNotifications((prev) => prev.filter((n) => n.id !== id));

  // Close panel when clicking outside
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  const btnStyle: React.CSSProperties = {
    background: "#E8E8F2",
    boxShadow: "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF",
    color: "#9090A8",
    border: "none",
    width: 36,
    height: 36,
  };

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: "#E8E8F2" }}>
      {/* Header */}
      <header
        className="h-14 flex items-center justify-between px-5"
        style={{ background: "#E8E8F2" }}
      >
        <SidebarTrigger
          className="rounded-xl transition-all"
          style={btnStyle}
        />

        <div className="flex items-center gap-3">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="rounded-xl flex items-center justify-center transition-all"
            style={btnStyle}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="rounded-xl flex items-center justify-center transition-all"
              style={{
                ...btnStyle,
                ...(notifOpen
                  ? { boxShadow: "inset 2px 2px 5px #C4C4D4, inset -2px -2px 5px #FFFFFF" }
                  : {}),
              }}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#E05B5B",
                    border: "2px solid #E8E8F2",
                  }}
                />
              )}
            </button>

            {/* Dropdown panel */}
            {notifOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  width: 340,
                  background: "#E8E8F2",
                  borderRadius: 18,
                  boxShadow: "8px 8px 20px #C0C0D0, -8px -8px 20px #FFFFFF",
                  zIndex: 50,
                  overflow: "hidden",
                }}
              >
                {/* Panel header */}
                <div
                  style={{
                    padding: "14px 16px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #D8D8E8",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#4A4A6A",
                      }}
                    >
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span
                        style={{
                          background: "linear-gradient(135deg,#7B8FE0,#5B6FD0)",
                          color: "#fff",
                          borderRadius: 99,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 7px",
                        }}
                      >
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{
                        fontSize: 11,
                        color: "#7B8FE0",
                        fontWeight: 600,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification list */}
                <div style={{ maxHeight: 360, overflowY: "auto", padding: "8px 0" }}>
                  {notifications.length === 0 ? (
                    <div
                      style={{
                        padding: "32px 16px",
                        textAlign: "center",
                        color: "#9090A8",
                        fontSize: 13,
                      }}
                    >
                      You're all caught up 🎉
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const ts = typeStyles[n.type];
                      return (
                        <div
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            padding: "10px 14px",
                            cursor: "pointer",
                            background: n.read ? "transparent" : "rgba(123,143,224,0.06)",
                            transition: "background 0.15s",
                          }}
                        >
                          {/* Type icon */}
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: ts.bg,
                              color: ts.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {ts.icon}
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 2,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: n.read ? 500 : 700,
                                  fontSize: 12.5,
                                  color: "#3A3A5A",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {n.title}
                              </span>
                              {!n.read && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#7B8FE0",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 11.5,
                                color: "#7A7A9A",
                                lineHeight: 1.4,
                              }}
                            >
                              {n.message}
                            </p>
                            <span style={{ fontSize: 10.5, color: "#ABABC4", marginTop: 3, display: "block" }}>
                              {n.time}
                            </span>
                          </div>

                          {/* Dismiss */}
                          <button
                            onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#ABABC4",
                              padding: 2,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar */}
          <div
            title={displayName}
            className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-semibold text-white select-none"
            style={{
              background: "linear-gradient(135deg, #7B8FE0, #5B6FD0)",
              boxShadow: "3px 3px 7px #C4C4D4, -2px -2px 5px #FFFFFF",
              cursor: "default",
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}