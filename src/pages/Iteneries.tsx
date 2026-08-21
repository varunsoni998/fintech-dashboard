import { useState, useRef, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  Upload,
  Globe,
  FileText,
  Mail,
  Loader2,
  X,
  Plus,
  Bot,
  Quote,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Database,
  FileCode,
  FileArchive,
  File,
} from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API = "https://fintech-dashboard-61vh.onrender.com/api/rag";

// ─── Types ───────────────────────────────────────────────────────────────────
type Source = "email" | "pdf" | "web";

interface Citation {
  source: Source;
  title: string;
  snippet: string;
  page?: number;
}

interface RAGResult {
  answer: string;
  citations: Citation[];
}

interface IndexedDocument {
  id: string;
  filename: string;
  file_type: string;
  page_count: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

interface UploadJob {
  job_id: string;
  filename: string;
  status: "processing" | "done" | "error";
  progress: string;
  error?: string;
  document_id?: string;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

// ─── File type helpers ────────────────────────────────────────────────────────
const SUPPORTED_EXTS = ["pdf", "txt", "docx", "doc", "zip"];

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-400" />;
  if (ext === "zip") return <FileArchive className="h-4 w-4 text-yellow-400" />;
  if (["docx", "doc"].includes(ext)) return <FileText className="h-4 w-4 text-blue-400" />;
  if (ext === "txt") return <File className="h-4 w-4 text-gray-400" />;
  return <FileCode className="h-4 w-4 text-emerald-400" />;
}

function getFileTypeLabel(file_type: string) {
  const map: Record<string, string> = {
    pdf: "PDF", txt: "TXT", docx: "DOCX", zip: "ZIP",
  };
  return map[file_type] || file_type.toUpperCase();
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
const AnswerMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p:          ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm text-foreground">{children}</p>,
      h1:         ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 text-foreground">{children}</h1>,
      h2:         ({ children }) => <h2 className="text-base font-bold mb-2 mt-4 text-foreground">{children}</h2>,
      h3:         ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 text-foreground">{children}</h3>,
      ul:         ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ul>,
      ol:         ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ol>,
      li:         ({ children }) => <li className="leading-6">{children}</li>,
      strong:     ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground mb-3">{children}</blockquote>
      ),
      code: ({ inline, children, className }: any) => {
        const lang = (className || "").replace("language-", "");
        return inline ? (
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">{children}</code>
        ) : (
          <div className="relative mb-3">
            {lang && (
              <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/80 rounded-bl rounded-tr-lg border-b border-l border-border">
                {lang}
              </div>
            )}
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs font-mono whitespace-pre-wrap border border-border">
              <code>{children}</code>
            </pre>
          </div>
        );
      },
    }}
  >
    {content}
  </ReactMarkdown>
);

// ─── Source metadata ──────────────────────────────────────────────────────────
const SOURCE_META: Record<Source, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Emails",     icon: <Mail className="h-3.5 w-3.5" />,     color: "bg-sky-50 text-sky-700 border-sky-200" },
  pdf:   { label: "Documents",  icon: <FileText className="h-3.5 w-3.5" />, color: "bg-amber-50 text-amber-700 border-amber-200" },
  web:   { label: "Web search", icon: <Globe className="h-3.5 w-3.5" />,    color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// ─── Full-page drop overlay ───────────────────────────────────────────────────
function DropOverlay({ visible, fileCount }: { visible: boolean; fileCount: number }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Animated border */}
      <div className="absolute inset-4 rounded-3xl border-2 border-dashed border-accent/60 transition-all" />

      {/* Center card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 bg-card border border-border shadow-2xl rounded-2xl px-16 py-12 max-w-sm w-full mx-4">

          {/* Animated upload icon */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
            <div className="relative h-20 w-20 rounded-full bg-accent/10 border-2 border-accent/40 flex items-center justify-center">
              <Upload className="h-9 w-9 text-accent" />
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-xl font-semibold text-foreground">
              Drop to index
              {fileCount > 1 ? ` ${fileCount} files` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              PDF, DOCX, TXT, ZIP supported
            </p>
          </div>

          {/* Supported formats row */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { label: "PDF",  color: "bg-red-50 text-red-600 border-red-200" },
              { label: "DOCX", color: "bg-blue-50 text-blue-600 border-blue-200" },
              { label: "TXT",  color: "bg-gray-50 text-gray-600 border-gray-200" },
              { label: "ZIP",  color: "bg-yellow-50 text-yellow-600 border-yellow-200" },
            ].map(({ label, color }) => (
              <span
                key={label}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const AIAssistant = () => {
  const [query, setQuery]   = useState("");
  const [notes, setNotes]   = useState("");
  const [sources, setSources] = useState<Source[]>(["pdf"]);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [result, setResult] = useState<RAGResult | null>(null);

  const [documents, setDocuments]     = useState<IndexedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadJobs, setUploadJobs]   = useState<UploadJob[]>([]);
  const [showDocs, setShowDocs]       = useState(false);

  // Drag state
  const [isDragging, setIsDragging]   = useState(false);
  const [dragFileCount, setDragFileCount] = useState(0);
  const dragCounter = useRef(0);   // tracks nested dragenter/dragleave pairs

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSource = (s: Source) =>
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // ── Load indexed documents ─────────────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const auth = await getAuthHeader();
      const resp = await fetch(`${API}/documents`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setDocuments(data.documents || []);
    } catch (e) {
      console.error("Failed to load documents:", e);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── Poll indexing job ──────────────────────────────────────────────────────
  const pollJob = useCallback((job_id: string) => {
    const poll = async () => {
      try {
        const auth = await getAuthHeader();
        const resp = await fetch(`${API}/status/${job_id}`, { headers: { Authorization: auth } });
        const data = await resp.json();
        setUploadJobs(prev => prev.map(j =>
          j.job_id === job_id
            ? { ...j, status: data.status, progress: data.progress || j.progress, error: data.error, document_id: data.document_id }
            : j
        ));
        if (data.status === "processing") {
          setTimeout(poll, 2000);
        } else if (data.status === "done") {
          loadDocuments();
          if (!sources.includes("pdf")) setSources(prev => [...prev, "pdf"]);
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };
    poll();
  }, [loadDocuments, sources]);

  // ── Handle file upload ─────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_EXTS.includes(ext)) {
        alert(`"${file.name}" is not supported. Please upload PDF, TXT, DOCX, or ZIP files.`);
        continue;
      }

      const tempId = `temp_${Date.now()}_${Math.random()}`;
      setUploadJobs(prev => [
        { job_id: tempId, filename: file.name, status: "processing", progress: "Uploading..." },
        ...prev,
      ]);

      try {
        const auth = await getAuthHeader();
        const formData = new FormData();
        formData.append("file", file);
        const resp = await fetch(`${API}/upload`, {
          method: "POST",
          headers: { Authorization: auth },
          body: formData,
        });
        const data = await resp.json();

        if (!resp.ok) {
          setUploadJobs(prev => prev.map(j =>
            j.job_id === tempId ? { ...j, status: "error", error: data.detail || "Upload failed" } : j
          ));
          continue;
        }

        setUploadJobs(prev => prev.map(j =>
          j.job_id === tempId ? { ...j, job_id: data.job_id, progress: "Extracting..." } : j
        ));
        pollJob(data.job_id);

      } catch (e: any) {
        setUploadJobs(prev => prev.map(j =>
          j.job_id === tempId ? { ...j, status: "error", error: e.message || "Network error" } : j
        ));
      }
    }
  }, [pollJob]);

  // ── Full-page drag-and-drop (window-level listeners) ──────────────────────
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        const count = e.dataTransfer?.items?.length || 0;
        setDragFileCount(count);
        setIsDragging(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      // Required to allow drop
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDragging(false);
        setDragFileCount(0);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      setDragFileCount(0);
      if (e.dataTransfer?.files) {
        handleFileUpload(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover",  onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop",      onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover",  onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop",      onDrop);
    };
  }, [handleFileUpload]);

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDocument = async (docId: string) => {
    try {
      const auth = await getAuthHeader();
      await fetch(`${API}/documents/${docId}`, { method: "DELETE", headers: { Authorization: auth } });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  // ── Generate answer (streaming) ────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setStreamingAnswer("");

    try {
      const auth = await getAuthHeader();
      const resp = await fetch(`${API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ query: query.trim(), notes, sources }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Query failed" }));
        throw new Error(err.detail || "Query failed");
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.raw_token) {
              fullAnswer += payload.raw_token;
              setStreamingAnswer(fullAnswer);
            }
            if (payload.done) {
              setResult({ answer: payload.answer || fullAnswer, citations: payload.citations || [] });
              setStreamingAnswer("");
            }
            if (payload.error) throw new Error(payload.error);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: any) {
      setResult({
        answer: `**Error:** ${e.message || "Something went wrong. Please try again."}`,
        citations: [],
      });
    } finally {
      setLoading(false);
      setStreamingAnswer("");
    }
  };

  const handleReset = () => { setResult(null); setQuery(""); setNotes(""); setStreamingAnswer(""); };

  const activeJobs  = uploadJobs.filter(j => j.status === "processing");
  const doneJobs    = uploadJobs.filter(j => j.status === "done").slice(0, 3);
  const errorJobs   = uploadJobs.filter(j => j.status === "error").slice(0, 3);

  const EXAMPLE_PROMPTS = [
    "Summarise the key points from the uploaded documents",
    "What are the main financial figures mentioned?",
    "Extract all dates and deadlines mentioned",
    "What are the terms and conditions in this document?",
  ];

  return (
    <DashboardLayout>
      {/* Full-page drop overlay — renders above everything */}
      <DropOverlay visible={isDragging} fileCount={dragFileCount} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.docx,.doc,.zip"
        multiple
        onChange={e => handleFileUpload(e.target.files)}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif text-foreground">RAG Model</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload documents, then ask questions — powered by Nemotron vector search
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/5 transition"
            >
              <Upload className="h-3.5 w-3.5" /> Upload files
            </button>
            <button
              onClick={() => { setShowDocs(v => !v); if (!showDocs) loadDocuments(); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
            >
              <Database className="h-3.5 w-3.5" />
              {documents.length} document{documents.length !== 1 ? "s" : ""} indexed
            </button>
          </div>
        </div>

        {/* Upload job banners */}
        {(activeJobs.length > 0 || doneJobs.length > 0 || errorJobs.length > 0) && (
          <div className="space-y-2">
            {activeJobs.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-sm">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="font-medium truncate flex-1">{job.filename}</span>
                <span className="text-blue-500 text-xs shrink-0">{job.progress}</span>
              </div>
            ))}
            {doneJobs.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-sm">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate flex-1">{job.filename}</span>
                <span className="text-emerald-500 text-xs shrink-0">Indexed successfully</span>
                <button onClick={() => setUploadJobs(prev => prev.filter(j => j.job_id !== job.job_id))}>
                  <X className="h-3.5 w-3.5 text-emerald-400 hover:text-emerald-600" />
                </button>
              </div>
            ))}
            {errorJobs.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate flex-1">{job.filename}</span>
                <span className="text-red-500 text-xs shrink-0 max-w-xs truncate">{job.error}</span>
                <button onClick={() => setUploadJobs(prev => prev.filter(j => j.job_id !== job.job_id))}>
                  <X className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document library */}
        {showDocs && (
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Indexed Documents</p>
              <button onClick={loadDocuments} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No documents indexed yet.</p>
                <p className="text-xs mt-1">Drop a file anywhere on the page to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-background hover:bg-muted/30 transition group">
                    {getFileIcon(doc.filename)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded mr-1.5">{getFileTypeLabel(doc.file_type)}</span>
                        {doc.page_count} {doc.file_type === "zip" ? "file" : "page"}{doc.page_count !== 1 ? "s" : ""} · {doc.chunk_count} chunks · {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                      doc.status === "indexed"    ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                      doc.status === "processing" ? "bg-blue-50 text-blue-600 border-blue-200" :
                                                    "bg-red-50 text-red-600 border-red-200"
                    }`}>
                      {doc.status}
                    </span>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-red-500 p-1"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!result && !streamingAnswer ? (
          /* ── Query form ── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-foreground">Ask anything about your documents</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What do you need?</label>
                <textarea
                  rows={4}
                  placeholder="e.g. What are the key terms in this contract? Summarise the financial data. What does the Button component do?"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => setQuery(p)}
                    className="text-xs px-3 py-1.5 rounded-full border text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Additional context <span className="normal-case text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Any constraints, tone, or specifics I should factor in…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              {/* Click-to-upload area (drag handled globally) */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl px-4 py-6 flex flex-col items-center gap-2 text-center hover:border-accent/50 hover:bg-accent/5 transition group"
              >
                <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-accent/10 flex items-center justify-center transition">
                  <Upload className="h-5 w-5 text-muted-foreground group-hover:text-accent transition" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground group-hover:text-foreground transition">
                    Click to upload, or <span className="text-accent font-medium">drag anywhere on the page</span>
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">PDF · DOCX · TXT · ZIP</p>
                </div>
              </button>

              <button
                onClick={handleGenerate}
                disabled={!query.trim() || loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Searching knowledge base…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generate answer</>
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground/50">⌘ + Enter to generate</p>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Data sources</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PDF · DOCX · TXT · ZIP fully supported.</p>
                </div>
                {(["pdf", "email", "web"] as Source[]).map(s => {
                  const meta = SOURCE_META[s];
                  const active = sources.includes(s);
                  const comingSoon = s !== "pdf";
                  return (
                    <button
                      key={s}
                      onClick={() => !comingSoon && toggleSource(s)}
                      disabled={comingSoon}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg border text-sm transition ${
                        comingSoon
                          ? "opacity-40 cursor-not-allowed border-border bg-background text-muted-foreground"
                          : active
                          ? "border-accent/40 bg-accent/5 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-accent/20"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-7 h-7 rounded-md border ${meta.color}`}>
                        {meta.icon}
                      </span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      {comingSoon
                        ? <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Soon</span>
                        : (
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${active ? "border-accent bg-accent" : "border-muted-foreground/40"}`}>
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        )
                      }
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border bg-card p-5 space-y-3">
                <p className="text-sm font-medium text-foreground">How it works</p>
                {[
                  { icon: <Upload className="h-3.5 w-3.5" />,    text: "Upload PDF, DOCX, TXT, or ZIP" },
                  { icon: <Database className="h-3.5 w-3.5" />,  text: "Files are chunked and vector-embedded" },
                  { icon: <Bot className="h-3.5 w-3.5" />,       text: "Ask questions in natural language" },
                  { icon: <Sparkles className="h-3.5 w-3.5" />,  text: "Nemotron retrieves and generates answers" },
                  { icon: <Quote className="h-3.5 w-3.5" />,     text: "Answers include page and file citations" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="text-accent shrink-0">{icon}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Result view ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-serif text-foreground truncate max-w-xl">{query}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {sources.map(s => {
                    const meta = SOURCE_META[s];
                    return (
                      <span key={s} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> New query
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Answer */}
              <div className="lg:col-span-3 rounded-xl border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-medium text-foreground">Answer</h3>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <div className="px-6 py-5">
                  {streamingAnswer && !result ? (
                    <div className="text-sm leading-7 text-foreground whitespace-pre-wrap">
                      {streamingAnswer}
                      <span className="inline-block w-1.5 h-4 bg-accent/70 animate-pulse ml-0.5 align-middle" />
                    </div>
                  ) : result ? (
                    <AnswerMarkdown content={result.answer} />
                  ) : null}
                </div>
              </div>

              {/* Citations */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Sources cited</p>
                {loading && !result ? (
                  <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Retrieving…
                  </div>
                ) : result && result.citations.length === 0 ? (
                  <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
                    No specific passages cited.
                  </div>
                ) : result ? (
                  result.citations.map((c, i) => {
                    const meta = SOURCE_META[c.source] || SOURCE_META.pdf;
                    const isCode = !c.page || c.page === 0;
                    return (
                      <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className={`flex items-center justify-center w-6 h-6 rounded-md border shrink-0 ${meta.color}`}>
                            {meta.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate" title={c.title}>{c.title}</p>
                            {!isCode && c.page && c.page > 0 && (
                              <p className="text-[10px] text-muted-foreground">Page {c.page}</p>
                            )}
                          </div>
                        </div>
                        {c.snippet && (
                          <div className="flex gap-1.5">
                            <Quote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{c.snippet}</p>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AIAssistant;