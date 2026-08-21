import {
  LayoutDashboard, Users, Map, MessageSquare, FileText,
  IndianRupee, TrendingUp, CalendarClock, Megaphone,
  UserCircle2, Globe, Truck, ChevronDown, ChevronRight,
  Bot, Handshake, UserCheck, Home, Sparkles, ImagePlus, Zap, LogOut,
} from "lucide-react";
import { NavLink } from "../../components/Navlink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from "../../components/ui/sidebar";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";

const STORAGE_KEY = "sidebar:modules";

function loadModuleState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { webAnalytics: true, leadAnalytics: true, supplierAnalytics: true, houseAutomation: true, mxai: true };
}
function saveModuleState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(moduleOpenState)); } catch {}
}
const moduleOpenState = loadModuleState();
type ModuleKey = keyof typeof moduleOpenState;

function ModuleSection({
  label, icon: Icon, accentColor, items, moduleKey, forceUpdate, dark,
}: {
  label: string; icon: React.ElementType; accentColor: string;
  items: { title: string; url: string; icon: React.ElementType }[];
  moduleKey: ModuleKey; forceUpdate: () => void; dark: boolean;
}) {
  const open = moduleOpenState[moduleKey];
  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_OUT = dark ? "3px 3px 7px #0D0D1A, -3px -3px 7px #272744" : "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF";
  const SHADOW_IN = dark ? "inset 2px 2px 5px #0D0D1A, inset -2px -2px 5px #272744" : "inset 2px 2px 5px #C4C4D4, inset -2px -2px 5px #FFFFFF";

  return (
    <SidebarGroup className="mt-4">
      <button
        onClick={() => { moduleOpenState[moduleKey] = !moduleOpenState[moduleKey]; saveModuleState(); forceUpdate(); }}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-2xl transition-all"
        style={{ background: BG, boxShadow: open ? SHADOW_IN : SHADOW_OUT }}
      >
        <div className={`h-6 w-6 rounded-xl flex items-center justify-center shrink-0 ${accentColor}`}
          style={{ boxShadow: "2px 2px 5px rgba(0,0,0,0.2)" }}>
          <Icon className="h-3 w-3 text-white" />
        </div>
        <span className="text-[10px] uppercase tracking-widest font-semibold flex-1 text-left" style={{ color: dark ? "#7070A0" : "#9090A8" }}>{label}</span>
        {open
          ? <ChevronDown className="h-3 w-3" style={{ color: dark ? "#7070A0" : "#9090A8" }} />
          : <ChevronRight className="h-3 w-3" style={{ color: dark ? "#7070A0" : "#9090A8" }} />}
      </button>
      {open && (
        <SidebarGroupContent className="mt-1">
          <SidebarMenu>
            {items.map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink to={item.url} end
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ml-1 mt-0.5"
                    style={{ color: dark ? "#7070A0" : "#9090A8" }}
                    activeClassName=""
                    activeStyle={{
                      color: "#6B7FD4", background: BG,
                      boxShadow: SHADOW_IN, fontWeight: 500,
                    }}>
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

export function DashboardSidebar() {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);
  const { user, profile } = useAuth();
  const { dark } = useDarkMode();

  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_OUT = dark ? "3px 3px 7px #0D0D1A, -3px -3px 7px #272744" : "3px 3px 7px #C4C4D4, -3px -3px 7px #FFFFFF";
  const SHADOW_IN = dark ? "inset 2px 2px 5px #0D0D1A, inset -2px -2px 5px #272744" : "inset 2px 2px 5px #C4C4D4, inset -2px -2px 5px #FFFFFF";
  const TEXT_MAIN = dark ? "#D0D0F0" : "#3D3D5C";
  const TEXT_MUTED = dark ? "#7070A0" : "#9090A8";
  const TEXT_FAINT = dark ? "#3A3A5A" : "#C4C4D4";

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  return (
    <Sidebar className="border-r-0" style={{ background: BG }}>
      <SidebarHeader className="px-4 py-5 border-b-0" style={{ background: BG }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #7B8FE0, #5B6FD0)", boxShadow: SHADOW_OUT }}>
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight leading-none" style={{ color: TEXT_MAIN }}>BusinessOS</h2>
            <p className="text-[10px] mt-0.5 tracking-widest uppercase" style={{ color: TEXT_MUTED }}>Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: BG }}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/" end
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all"
                    style={{ color: TEXT_MUTED }} activeClassName=""
                    activeStyle={{ color: "#6B7FD4", background: BG, boxShadow: SHADOW_IN, fontWeight: 500 }}>
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Overview</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <ModuleSection dark={dark} label="Analytics & Content" icon={Globe} accentColor="bg-sky-400" moduleKey="webAnalytics" forceUpdate={forceUpdate}
          items={[{ title: "Web Analytics", url: "/web-analytics", icon: TrendingUp }, { title: "Content", url: "/content", icon: FileText }]} />

        <ModuleSection dark={dark} label="Lead Analytics" icon={Users} accentColor="bg-emerald-400" moduleKey="leadAnalytics" forceUpdate={forceUpdate}
          items={[{ title: "Leads", url: "/leads", icon: UserCheck }, { title: "Campaign Design", url: "/campaign-design", icon: Megaphone }, { title: "RAG Model", url: "/itineraries", icon: Map }, { title: "Clients & PMS", url: "/client-pms", icon: UserCircle2 }]} />

        <ModuleSection dark={dark} label="Suppliers" icon={Truck} accentColor="bg-violet-400" moduleKey="supplierAnalytics" forceUpdate={forceUpdate}
          items={[{ title: "Suppliers", url: "/suppliers", icon: Truck }, { title: "Supplier Reachout", url: "/supplier-reachout", icon: Bot }, { title: "Active Deals", url: "/active-deals", icon: Handshake }]} />

        <ModuleSection dark={dark} label="Operations" icon={Home} accentColor="bg-orange-400" moduleKey="houseAutomation" forceUpdate={forceUpdate}
          items={[{ title: "Scheduling", url: "/scheduling", icon: CalendarClock }, { title: "Todo", url: "/todo", icon: CalendarClock }, { title: "Finance KPIs", url: "/finance-kpis", icon: IndianRupee }, { title: "Team Chat", url: "/chat", icon: MessageSquare }, { title: "Creatives", url: "/creatives", icon: ImagePlus }, { title: "Automations", url: "/automations", icon: Zap }]} />

        {/* Zeno AI */}
        <SidebarGroup className="mt-4">
          <button
            onClick={() => { moduleOpenState.mxai = !moduleOpenState.mxai; saveModuleState(); forceUpdate(); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-2xl transition-all"
            style={{ background: BG, boxShadow: moduleOpenState.mxai ? SHADOW_IN : SHADOW_OUT }}>
            <div className="h-6 w-6 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #9B8FE8, #6B7FD4)", boxShadow: "2px 2px 5px rgba(0,0,0,0.2)" }}>
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-semibold flex-1 text-left" style={{ color: TEXT_MUTED }}>Zeno AI</span>
            {moduleOpenState.mxai
              ? <ChevronDown className="h-3 w-3" style={{ color: TEXT_MUTED }} />
              : <ChevronRight className="h-3 w-3" style={{ color: TEXT_MUTED }} />}
          </button>
          {moduleOpenState.mxai && (
            <SidebarGroupContent className="mt-1">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/mxai" end
                      className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ml-1 mt-0.5"
                      style={{ color: TEXT_MUTED }} activeClassName=""
                      activeStyle={{ color: "#6B7FD4", background: BG, boxShadow: SHADOW_IN, fontWeight: 500 }}>
                      <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#6B7FD4" }} />
                      <span>Zeno</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      {/* User info + sign out */}
      <div className="p-4 mt-auto" style={{ background: BG }}>
        {user && (
          <div className="mb-3 px-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #7B8FE0, #5B6FD0)", boxShadow: SHADOW_OUT }}>
                {(profile?.full_name || user.email || "U")[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: TEXT_MAIN }}>
                  {profile?.full_name || user.email?.split("@")[0]}
                </p>
                <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>
                  {profile?.role || "member"}
                </p>
              </div>
            </div>
          </div>
        )}
        <button onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs transition-all"
          style={{ background: BG, boxShadow: SHADOW_OUT, color: "#E05A5A", border: "none", cursor: "pointer" }}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
        <p className="text-[10px] text-center tracking-widest uppercase mt-3" style={{ color: TEXT_FAINT }}>
          Powered by <span style={{ color: TEXT_MUTED }}>BusinessOS</span>
        </p>
      </div>
    </Sidebar>
  );
}