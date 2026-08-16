import React, { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import {
  Calendar, Mail, Link as LinkIcon, CheckCircle2,
  Loader2, ExternalLink, Users, RefreshCw, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

type SentLead = {
  id: number;
  created_at?: string;
  client_name: string;
  client_email: string;
  company_name: string;
  meeting_link: string;
  status?: string;
};

/* ── Calendly URL — change this to your actual Calendly link ── */
const CALENDLY_BASE = "https://calendly.com/your-link";

const Scheduling = () => {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [company, setCompany] = useState("");

  const [loading,      setLoading]      = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [successMsg,   setSuccessMsg]   = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied,       setCopied]       = useState(false);

  const [leads, setLeads] = useState<SentLead[]>([]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const supabaseHeaders = {
    "Content-Type":  "application/json",
    "apikey":        anonKey,
    "Authorization": `Bearer ${anonKey}`,
  };

  /* ── Load records ── */
  const loadLeads = async () => {
    setTableLoading(true);
    setErrorMsg("");
    try {
      const res  = await fetch(
        `${supabaseUrl}/rest/v1/meeting_details?select=*&order=id.desc`,
        { headers: supabaseHeaders },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      setLeads(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load records");
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => { loadLeads(); }, []);

  /* ── Send booking link ── */
  const sendBookingLink = async () => {
    setErrorMsg(""); setSuccessMsg("");
    if (!name.trim() || !email.trim()) {
      setErrorMsg("Client Name and Email are required.");
      return;
    }

    setLoading(true);
    try {
      /* Build a Calendly prefill URL so the client's details are pre-filled */
      const bookingUrl = `${CALENDLY_BASE}?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;

      /* Save to Supabase */
      const res = await fetch(`${supabaseUrl}/rest/v1/meeting_details`, {
        method: "POST",
        headers: { ...supabaseHeaders, Prefer: "return=representation" },
        body: JSON.stringify([{
          client_name:  name.trim(),
          client_email: email.trim(),
          company_name: company.trim() || null,
          meeting_link: bookingUrl,
          status:       "Link Sent",
        }]),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.message || "Failed to save record");

      setGeneratedLink(bookingUrl);

      /* Open Gmail compose */
      const subject = "Your Meeting Booking Link — Custom Holidays";
      const body    =
        `Dear ${name},\n\nPlease use the link below to schedule your meeting with us:\n\n${bookingUrl}\n\nLooking forward to speaking with you.\n\nWarm regards,\nCustom Holidays Team`;
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank",
      );

      setSuccessMsg("Booking link created and Gmail compose opened!");
      setName(""); setEmail(""); setCompany("");
      await loadLeads();
    } catch (e: any) {
      setErrorMsg(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const stats = useMemo(() => [
    { label: "Total Links Sent", value: String(leads.length), icon: LinkIcon,      sub: "Saved in Supabase"  },
    { label: "Clients Tracked",  value: String(leads.length), icon: Users,         sub: "Unique contacts"    },
    { label: "Platform",         value: "Calendly",           icon: Calendar,      sub: "Live scheduling"    },
    { label: "Status",           value: "Active",             icon: CheckCircle2,  sub: "Connected"          },
  ], [leads]);

  /* ─────────────────────────────── RENDER ─────────────────────────────── */
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Scheduling & Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Send Calendly booking links and track meetings in Supabase
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadLeads} className="gap-2 self-start">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((item, i) => (
            <motion.div key={item.label} {...fade(i * 0.05)}
              className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <item.icon className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <p className="text-xl font-serif text-card-foreground">{item.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{item.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left column ── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Send booking link form */}
            <motion.div {...fade(0.15)} className="rounded-xl border bg-card shadow-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" />
                <h3 className="font-serif text-lg text-card-foreground">Send Booking Link</h3>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Client Name *</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Client Email *</label>
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="rahul@email.com"
                      type="email"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Company Name</label>
                    <input
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="ABC Travels Pvt. Ltd."
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    />
                  </div>
                </div>

                <Button
                  onClick={sendBookingLink}
                  disabled={loading}
                  className="w-full bg-gradient-gold text-accent-foreground hover:opacity-90"
                >
                  {loading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                    : <><Mail className="h-4 w-4 mr-2" />Send Booking Link via Gmail</>}
                </Button>

                {/* Success */}
                {successMsg && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {successMsg}
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMsg}
                  </div>
                )}

                {/* Generated link */}
                {generatedLink && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-xs font-medium text-blue-700 mb-1.5">Generated Booking Link</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-blue-600 break-all flex-1">{generatedLink}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={copyLink}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors" title="Copy link">
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a href={generatedLink} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors" title="Open link">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Records table */}
            <motion.div {...fade(0.2)} className="rounded-xl border bg-card shadow-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  <h3 className="font-serif text-lg text-card-foreground">Booking Records</h3>
                </div>
                <span className="text-xs text-muted-foreground">{leads.length} total</span>
              </div>

              {tableLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading records…</span>
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No booking records yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send your first booking link using the form above.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Client", "Email", "Company", "Date", "Status", "Link"].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead, i) => (
                        <motion.tr key={lead.id} {...fade(0.25 + i * 0.02)}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-card-foreground whitespace-nowrap">
                            {lead.client_name}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {lead.client_email}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {lead.company_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(lead.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              {lead.status || "Sent"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {lead.meeting_link ? (
                              <a href={lead.meeting_link} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : "—"}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-6">
            <motion.div {...fade(0.25)} className="rounded-xl border bg-card p-4 shadow-card">
              <h3 className="font-serif text-base text-card-foreground mb-3">Integrations</h3>
              <div className="space-y-2">
                {[
                  { name: "Supabase",       status: "Connected", color: "bg-green-100 text-green-700" },
                  { name: "Calendly",       status: "Connected", color: "bg-green-100 text-green-700" },
                  { name: "Gmail Compose",  status: "Connected", color: "bg-green-100 text-green-700" },
                ].map(item => (
                  <div key={item.name}
                    className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-card-foreground">{item.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.color}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...fade(0.3)} className="rounded-xl border bg-card p-4 shadow-card">
              <h3 className="font-serif text-base text-card-foreground mb-3">How it works</h3>
              <ol className="space-y-3">
                {[
                  "Enter the client's name and email",
                  "Click Send Booking Link",
                  "Gmail opens with a pre-filled email containing the Calendly link",
                  "The record is saved to Supabase automatically",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </motion.div>

            {/* Quick tip */}
            <motion.div {...fade(0.35)} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚙️ Setup required</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Update <code className="bg-amber-100 px-1 rounded">CALENDLY_BASE</code> at the top of this file with your actual Calendly URL before going live.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Scheduling;
