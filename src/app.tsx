import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index            from "./pages/index";
import Login            from "./pages/Login";
import Analytics        from "./pages/Analytics";
import Leads            from "./pages/Leads";
import Suppliers        from "./pages/suppliers";
import Itineraries      from "./pages/Iteneries";
import Operations       from "./pages/Operations";
import Content          from "./pages/Content";
import Chat             from "./pages/Chat";
import NotFound         from "./pages/Notfound";
import CampaignDesign   from "./pages/CampaignDesigner";
import Scheduling       from "./pages/Scheduling";
import ClientPMS        from "./pages/Client and pms";
import FinanceKPIs      from "./pages/finance and  kpis";
import LeadAnalytics    from "./pages/Leadanalytics";
import WebAnalytics     from "./pages/Web analytics";
import SupplierReachout from "./pages/SupplierReachout";
import ActiveDeals      from "./pages/ActiveDeals";
import MXAI             from "./pages/MXAI";
import TodoPage         from "./pages/TodoPage";
import BookMeeting      from "@/pages/BookMeeting";
import Creatives        from "./pages/Creatives";
import Automations      from "./pages/Automations";

const queryClient = new QueryClient();

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <Routes>
          <Route path="/"               element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/finance-kpis"   element={<ProtectedRoute><FinanceKPIs /></ProtectedRoute>} />
          <Route path="/analytics"      element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/lead-analytics" element={<ProtectedRoute><LeadAnalytics /></ProtectedRoute>} />
          <Route path="/web-analytics"  element={<ProtectedRoute><WebAnalytics /></ProtectedRoute>} />
          <Route path="/leads"             element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/suppliers"         element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
          <Route path="/supplier-reachout" element={<ProtectedRoute><SupplierReachout /></ProtectedRoute>} />
          <Route path="/active-deals"      element={<ProtectedRoute><ActiveDeals /></ProtectedRoute>} />
          <Route path="/itineraries"       element={<ProtectedRoute><Itineraries /></ProtectedRoute>} />
          <Route path="/operations"        element={<ProtectedRoute><Operations /></ProtectedRoute>} />
          <Route path="/content"           element={<ProtectedRoute><Content /></ProtectedRoute>} />
          <Route path="/chat"              element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/campaign-design"   element={<ProtectedRoute><CampaignDesign /></ProtectedRoute>} />
          <Route path="/scheduling"        element={<ProtectedRoute><Scheduling /></ProtectedRoute>} />
          <Route path="/client-pms"        element={<ProtectedRoute><ClientPMS /></ProtectedRoute>} />
          <Route path="/todo"              element={<ProtectedRoute><TodoPage /></ProtectedRoute>} />
          <Route path="/mxai"              element={<ProtectedRoute><MXAI /></ProtectedRoute>} />
          <Route path="/automations"       element={<ProtectedRoute><Automations /></ProtectedRoute>} />
          <Route path="/book"              element={<ProtectedRoute><BookMeeting /></ProtectedRoute>} />
          <Route path="/creatives"         element={<ProtectedRoute><Creatives /></ProtectedRoute>} />
          <Route path="*"                  element={<NotFound />} />
        </Routes>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;