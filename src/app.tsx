import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

import Index            from "./pages/index";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <DashboardSidebar />
            <Routes>
              <Route path="/"               element={<Index />} />
              <Route path="/finance-kpis"   element={<FinanceKPIs />} />
              <Route path="/analytics"      element={<Analytics />} />
              <Route path="/lead-analytics" element={<LeadAnalytics />} />
              <Route path="/web-analytics"  element={<WebAnalytics />} />
              <Route path="/leads"             element={<Leads />} />
              <Route path="/suppliers"         element={<Suppliers />} />
              <Route path="/supplier-reachout" element={<SupplierReachout />} />
              <Route path="/active-deals"      element={<ActiveDeals />} />
              <Route path="/itineraries"       element={<Itineraries />} />
              <Route path="/operations"        element={<Operations />} />
              <Route path="/content"           element={<Content />} />
              <Route path="/chat"              element={<Chat />} />
              <Route path="/campaign-design"   element={<CampaignDesign />} />
              <Route path="/scheduling"        element={<Scheduling />} />
              <Route path="/client-pms"        element={<ClientPMS />} />
              <Route path="/todo"              element={<TodoPage />} />
              <Route path="/mxai"              element={<MXAI />} />
              <Route path="/automations"       element={<Automations />} />
              <Route path="/book"              element={<BookMeeting />} />
              <Route path="/creatives"         element={<Creatives />} />
              <Route path="*"                  element={<NotFound />} />
            </Routes>
          </div>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;