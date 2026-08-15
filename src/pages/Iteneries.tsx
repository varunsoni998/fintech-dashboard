import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Upload,
  Globe,
  FileText,
  Mail,
  ChevronRight,
  Loader2,
  X,
  Plus,
  Bot,
  Quote,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Source = "email" | "pdf" | "web";

interface Citation {
  source: Source;
  title: string;
  snippet: string;
}

interface RAGResult {
  answer: string; // markdown
  citations: Citation[];
}

// ─── Markdown renderer (answer body) ──────────────────────────────────────────

const AnswerMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm text-foreground">{children}</p>,
      h1: ({ children }) => <h1 className="text-lg font-serif mb-3 mt-4 text-foreground">{children}</h1>,
      h2: ({ children }) => <h2 className="text-base font-serif mb-2 mt-4 text-foreground">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 text-foreground">{children}</h3>,
      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ol>,
      li: ({ children }) => <li className="leading-6">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      code: ({ inline, children }: any) =>
        inline ? (
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
        ) : (
          <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs font-mono mb-3 whitespace-pre-wrap">
            <code>{children}</code>
          </pre>
        ),
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground mb-3">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="border-border my-4" />,
    }}
  >
    {content}
  </ReactMarkdown>
);

// ─── Source pill meta ─────────────────────────────────────────────────────────

const SOURCE_META: Record<Source, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Emails",     icon: <Mail className="h-3.5 w-3.5" />,     color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800" },
  pdf:   { label: "PDFs",       icon: <FileText className="h-3.5 w-3.5" />, color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" },
  web:   { label: "Web search", icon: <Globe className="h-3.5 w-3.5" />,    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" },
};

// ─── Mock response builder — swap for real RAG fetch() later ─────────────────

const buildMockResponse = (query: string, srcs: Source[]): RAGResult => {
  const usesEmail = srcs.includes("email");
  const usesPdf = srcs.includes("pdf");
  const usesWeb = srcs.includes("web");

  const parts: string[] = [`## Here's what I found\n\nBased on your request — "${query.trim()}" — here's a draft answer pulled from your connected sources.`];

  if (usesEmail) parts.push(`**From recent emails:** relevant threads were matched and summarised into the context below.`);
  if (usesPdf) parts.push(`**From uploaded documents:** key details were extracted and cross-checked against your request.`);
  if (usesWeb) parts.push(`**From live web data:** current information was pulled in to fill any gaps.`);

  parts.push(`### Suggested next step\nReview the draft below, tweak anything that's off, and I can regenerate with adjusted instructions.`);

  return {
    answer: parts.join("\n\n"),
    citations: [
      ...(usesEmail ? [{ source: "email" as Source, title: "Re: Follow-up — thread match", snippet: "Relevant context pulled from your inbox…" }] : []),
      ...(usesPdf ? [{ source: "pdf" as Source, title: "uploaded_document.pdf", snippet: "Key details extracted from the document…" }] : []),
      ...(usesWeb ? [{ source: "web" as Source, title: "Live web result", snippet: "Current information matched to your query…" }] : []),
    ],
  };
};

// ─── Main component ───────────────────────────────────────────────────────────

const AIAssistant = () => {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [sources, setSources] = useState<Source[]>(["email", "web"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RAGResult | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const toggleSource = (s: Source) =>
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    // Simulate async RAG call — swap this for the real fetch() later
    await new Promise((r) => setTimeout(r, 1800));
    setResult(buildMockResponse(query, sources));
    setLoading(false);
  };

  const handleReset = () => {
    setResult(null);
    setQuery("");
    setNotes("");
    setUploadedFiles([]);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).map((f) => f.name);
    setUploadedFiles((prev) => [...new Set([...prev, ...files])]);
    if (!sources.includes("pdf")) setSources((prev) => [...prev, "pdf"]);
  };

  const EXAMPLE_PROMPTS = [
    "Draft a follow-up email for the Kyoto lead",
    "Summarise this quarter's supplier contracts",
    "Find flight and hotel options for a Lisbon trip",
    "What did the last 3 emails from Acme Corp say?",
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif text-foreground">RAG Model</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RAG-powered answers and drafts from your emails, PDFs, and live web data — ask for anything
          </p>
        </div>

        {!result ? (
          /* ── Query form ── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main input card */}
            <div className="lg:col-span-2 rounded-xl border bg-card shadow-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-foreground">Ask anything</span>
              </div>

              {/* Query */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  What do you need?
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Draft a follow-up email for the Kyoto lead, summarise this quarter's supplier contracts, find flight options to Lisbon…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              {/* Example prompts */}
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setQuery(p)}
                    className="text-xs px-3 py-1.5 rounded-full border text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Additional context */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Additional context <span className="normal-case text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Any constraints, tone, deadlines, or specifics I should factor in…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              {/* File upload */}
              <div
                className="border-2 border-dashed rounded-lg px-4 py-5 flex flex-col items-center gap-2 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => {
                  // In real app: trigger file input
                  const fakeFiles = ["reference_document.pdf"];
                  setUploadedFiles((prev) => [...new Set([...prev, ...fakeFiles])]);
                  if (!sources.includes("pdf")) setSources((prev) => [...prev, "pdf"]);
                }}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop any relevant documents here — contracts, reports, confirmations, notes
                </p>
                <span className="text-xs text-muted-foreground/60">PDF, DOCX, TXT</span>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((f) => (
                    <span
                      key={f}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-muted text-muted-foreground"
                    >
                      <FileText className="h-3 w-3" />
                      {f}
                      <button
                        onClick={() => setUploadedFiles((prev) => prev.filter((x) => x !== f))}
                        className="ml-0.5 hover:text-foreground transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!query.trim() || loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate answer
                  </>
                )}
              </button>
            </div>

            {/* Sidebar — data sources */}
            <div className="space-y-4">
              <div className="rounded-xl border bg-card shadow-card p-5 space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Data sources</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select what the AI should draw from
                  </p>
                </div>

                {(["email", "pdf", "web"] as Source[]).map((s) => {
                  const meta = SOURCE_META[s];
                  const active = sources.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSource(s)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg border text-sm transition ${
                        active
                          ? "border-accent/40 bg-accent/5 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-accent/20"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-7 h-7 rounded-md border ${meta.color}`}>
                        {meta.icon}
                      </span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                          active ? "border-accent bg-accent" : "border-muted-foreground/40"
                        }`}
                      >
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* What it can do */}
              <div className="rounded-xl border bg-card shadow-card p-5 space-y-3">
                <p className="text-sm font-medium text-foreground">What you can ask for</p>
                {[
                  { icon: <Mail className="h-3.5 w-3.5" />, text: "Draft or summarise emails" },
                  { icon: <FileText className="h-3.5 w-3.5" />, text: "Extract info from documents" },
                  { icon: <Globe className="h-3.5 w-3.5" />, text: "Pull current web data" },
                  { icon: <Sparkles className="h-3.5 w-3.5" />, text: "Plans, itineraries, research" },
                  { icon: <Bot className="h-3.5 w-3.5" />, text: "Anything else — just ask" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="text-accent">{icon}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Result view ── */
          <div className="space-y-4">
            {/* Result header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-serif text-foreground truncate max-w-xl">{query}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {sources.map((s) => {
                    const meta = SOURCE_META[s];
                    return (
                      <span
                        key={s}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.color}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    );
                  })}
                  <span className="text-xs text-muted-foreground">used as sources</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New query
                </button>
                <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition">
                  <Upload className="h-3.5 w-3.5" />
                  Export
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Answer */}
              <div className="lg:col-span-3 rounded-xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-medium text-foreground">Answer</h3>
                </div>
                <div className="px-6 py-5">
                  <AnswerMarkdown content={result.answer} />
                </div>
              </div>

              {/* Citations */}
              <div className="lg:col-span-1 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  Sources used
                </p>
                {result.citations.length === 0 ? (
                  <div className="rounded-xl border bg-card shadow-card p-4 text-xs text-muted-foreground">
                    No sources were selected for this query.
                  </div>
                ) : (
                  result.citations.map((c, i) => {
                    const meta = SOURCE_META[c.source];
                    return (
                      <div key={i} className="rounded-xl border bg-card shadow-card p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center justify-center w-6 h-6 rounded-md border ${meta.color}`}>
                            {meta.icon}
                          </span>
                          <span className="text-xs font-medium text-foreground truncate">{c.title}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <Quote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-relaxed">{c.snippet}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AIAssistant;