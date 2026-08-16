import { useState, useRef } from "react";
import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Download,
  FileText,
  Instagram,
  Linkedin,
  Mail,
  Globe,
  Hash,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

const API = "https://fintech-dashboard-61vh.onrender.com/api";

const genId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const contentTypes = [
  { id: "blog", label: "Blog Post", icon: FileText, color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { id: "instagram", label: "Instagram Caption", icon: Instagram, color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  { id: "linkedin", label: "LinkedIn Post", icon: Linkedin, color: "bg-blue-600/10 text-blue-500 border-blue-600/20" },
  { id: "email", label: "Email Campaign", icon: Mail, color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "website", label: "Website Copy", icon: Globe, color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { id: "hashtags", label: "Hashtag Set", icon: Hash, color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
];

const tones = ["Luxury", "Friendly", "Professional", "Inspiring", "Urgent", "Playful"];

const QUICK_IDEAS = [
  "New product launch announcement",
  "Weekly newsletter for our subscribers",
  "Case study: how we helped a client succeed",
  "Limited-time promotion for loyal customers",
  "Behind-the-scenes look at our team",
  "Customer testimonial spotlight",
];

interface GeneratedContent {
  id: string;
  type: string;
  topic: string;
  tone: string;
  audience: string;
  content: string;
  timestamp: Date;
}

const ContentMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm">{children}</p>,
      h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
      h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
      h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
      li: ({ children }) => <li className="leading-6">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
    }}
  >
    {content}
  </ReactMarkdown>
);

export default function Content() {
  const [selectedType, setSelectedType] = useState(contentTypes[0]);
  const [selectedTone, setSelectedTone] = useState("Professional");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [toneOpen, setToneOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (!topic.trim() || loading) return;

    setLoading(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API}/mxai/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: selectedType.id,
          tone: selectedTone,
          topic: topic.trim(),
          audience: audience.trim() || "general audience",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to generate");
      }

      const data = await res.json();
      const clean = (data.content || "").trim();

      setStreamingContent(clean);
      setHistory((prev) => [
        {
          id: genId(),
          type: selectedType.label,
          topic,
          tone: selectedTone,
          audience: audience.trim() || "general audience",
          content: clean,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamingContent("❌ Could not generate content. Make sure the backend is running.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const copyContent = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadContent = (text: string, type: string, topic: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type.toLowerCase().replace(/ /g, "-")}-${topic.slice(0, 20)}.txt`;
    a.click();
  };

  const currentContent = streamingContent || history[0]?.content || "";
  const isStreaming = loading && streamingContent.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-fuchsia-500" />
              Content Generator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered content creation
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-5">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content Type</p>
              <div className="grid grid-cols-2 gap-2">
                {contentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      selectedType.id === type.id
                        ? `${type.color} border-current`
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <type.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tone</p>
              <div className="relative">
                <button
                  onClick={() => setToneOpen(!toneOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border text-sm bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span>{selectedTone}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${toneOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {toneOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden"
                    >
                      {tones.map((tone) => (
                        <button
                          key={tone}
                          onClick={() => {
                            setSelectedTone(tone);
                            setToneOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                            selectedTone === tone ? "bg-muted font-medium" : ""
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Audience</p>
              <Input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                placeholder="e.g. small business owners, new parents, B2B SaaS buyers"
                className="text-sm"
              />
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Topic / Subject</p>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                placeholder="e.g. Announcing our new loyalty program"
                className="text-sm"
              />
              <Button
                onClick={generate}
                disabled={!topic.trim() || loading}
                className="w-full bg-gradient-to-r from-fuchsia-500 to-indigo-600 hover:opacity-90 text-white gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                  </>
                )}
              </Button>
              {loading && (
                <button
                  onClick={() => {
                    abortRef.current?.abort();
                    setLoading(false);
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-red-400 transition-colors"
                >
                  Stop generation
                </button>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Ideas</p>
              <div className="space-y-1.5">
                {QUICK_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => setTopic(idea)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-card-foreground transition-colors border border-transparent hover:border-border"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border bg-card min-h-[400px] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <selectedType.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-card-foreground">
                    {selectedType.label}
                    {topic && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {topic.slice(0, 40)}
                        {topic.length > 40 ? "..." : ""}
                      </span>
                    )}
                  </span>
                  {isStreaming && <span className="text-[10px] text-fuchsia-400 animate-pulse">● writing...</span>}
                </div>
                {currentContent && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => copyContent(currentContent, "current")}
                    >
                      {copied === "current" ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => downloadContent(currentContent, selectedType.label, topic)}
                    >
                      <Download className="h-3 w-3" /> Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        setStreamingContent("");
                        generate();
                      }}
                    >
                      <RotateCcw className="h-3 w-3" /> Regenerate
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-5 overflow-y-auto">
                {!currentContent && !loading ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-indigo-600/20 flex items-center justify-center mb-4">
                      <Sparkles className="h-7 w-7 text-fuchsia-400" />
                    </div>
                    <p className="text-sm font-medium text-card-foreground mb-1">Ready to create</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Select a content type, pick a tone, describe your audience, enter your topic and click Generate.
                    </p>
                  </div>
                ) : loading && !streamingContent ? (
                  <div className="flex items-center justify-center h-full py-16">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />
                      <span className="text-sm">Writing your content...</span>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none text-card-foreground">
                    <ContentMarkdown content={currentContent} />
                  </div>
                )}
              </div>
            </div>

            {history.length > 1 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Previous Generations
                </p>
                {history.slice(1, 4).map((item) => (
                  <div key={item.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-card-foreground">{item.type}</span>
                        <span className="text-[10px] text-muted-foreground">
                          · {item.tone} · {item.topic.slice(0, 30)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={() => copyContent(item.content, item.id)}
                        >
                          {copied === item.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {item.content.slice(0, 200)}...
                    </p>
                    <button
                      onClick={() => setStreamingContent(item.content)}
                      className="text-[10px] text-fuchsia-400 hover:text-fuchsia-500 mt-2 transition-colors"
                    >
                      View full →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
