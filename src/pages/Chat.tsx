import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Paperclip, Search, Phone, Video, MoreVertical, CheckCheck,
  Plus, Trash2, X, Users, User, File as FileIcon, FileArchive,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";

// Replace the existing API_BASE line at the top of Chat.tsx with this:

const getApiBase = () => {
  const hostname = window.location.hostname;
  // Tauri desktop app uses 'tauri.localhost' — point to the actual server IP instead
  if (hostname === "tauri.localhost" || hostname === "localhost" || hostname === "127.0.0.1") {
    return "https://fintech-dashboard-61vh.onrender.com/api";
  }
  // Browser on LAN — use the same host that served the page
  return `http://${hostname}:8000/api`;
};

const API_BASE = getApiBase();

// ── Assumed backend endpoints (see contract notes at bottom of file) ──
const UPLOAD_URL     = `${API_BASE}/chat-upload`;
const GROUPS_URL      = `${API_BASE}/chat-groups`;
const PRESENCE_URL    = `${API_BASE}/presence`;
const PRESENCE_LEAVE  = `${API_BASE}/presence/leave`;

const MESSAGES_POLL_MS  = 3000;
const GROUPS_POLL_MS    = 5000;
const PRESENCE_POLL_MS  = 5000;
const HEARTBEAT_MS      = 8000;

type ConversationType = "group" | "dm";

interface Conversation {
  id: string;           // sent to the backend as the `channel` param
  label: string;         // display name (group name, or the other person's name)
  lastMessage: string;
  avatar: string;
  type: ConversationType;
  online?: boolean;       // dm only — currently logged in or not
}

const DEFAULT_GROUPS: Conversation[] = [
  { id: "General",      label: "General",      lastMessage: "Daily updates and team announcements", avatar: "GN", type: "group" },
  { id: "Operations",   label: "Operations",   lastMessage: "Operations updates",                   avatar: "OP", type: "group" },
  { id: "Content Team", label: "Content Team", lastMessage: "Content updates",                       avatar: "CT", type: "group" },
  { id: "Sales",        label: "Sales",        lastMessage: "Sales updates",                         avatar: "SL", type: "group" },
];

// Local fallback cache only — the source of truth is the server once it's reachable
const GROUPS_CACHE_KEY = "chat_groups_cache_v1";
// Local shortcut list so people you've DMed still show up after they log out
const RECENT_DMS_KEY = "chat_recent_dms_v1";

const makeAvatar = (name: string) =>
  name.trim().slice(0, 2).toUpperCase() || "??";

// Deterministic id shared by both participants, regardless of who started it
const makeDmId = (a: string, b: string) =>
  "dm:" + [a.trim(), b.trim()].sort((x, y) => x.localeCompare(y)).join("::");

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

interface Attachment {
  url: string;
  name: string;
  size: number;
  mime: string;
}

type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  time: string;
  self: boolean;
  channel: string;
  attachment?: Attachment;
};

interface PendingUpload {
  tempId: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const Chat = () => {
  const [groups, setGroups] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem(GROUPS_CACHE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_GROUPS;
    } catch {
      return DEFAULT_GROUPS;
    }
  });
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
  // Everyone who has ever opened the app on any PC — from the server's
  // shared roster, not this browser's own localStorage. This is what
  // makes people visible everywhere, not just when they're online.
  const [knownNames, setKnownNames] = useState<string[]>([]);
  const [recentDmNames, setRecentDmNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_DMS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const [addMode, setAddMode] = useState<"group" | "dm" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const uploadXhrsRef = useRef<Record<string, XMLHttpRequest>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Identity ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("chat_username");
    if (saved) setMyName(saved);
  }, []);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    localStorage.setItem("chat_username", trimmed);
    setMyName(trimmed);
  };

  const signOut = () => {
    if (myName) {
      // Best-effort — actual presence expiry should also happen server-side
      // via a last-seen TTL, since this isn't guaranteed to fire.
      navigator.sendBeacon?.(
        PRESENCE_LEAVE,
        new Blob([JSON.stringify({ name: myName })], { type: "application/json" })
      );
    }
    localStorage.removeItem("chat_username");
    setMyName(null);
    setNameInput("");
    setOnlineNames([]);
  };

  useEffect(() => {
    const handleUnload = () => {
      if (!myName) return;
      navigator.sendBeacon?.(
        PRESENCE_LEAVE,
        new Blob([JSON.stringify({ name: myName })], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [myName]);

  // ── Presence: heartbeat so others see you as online ────
  useEffect(() => {
    if (!myName) return;
    const beat = () => {
      fetch(PRESENCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: myName }),
      }).catch((err) => console.error("Presence heartbeat failed:", err));
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [myName]);

  // ── Presence: poll who else is online, and who has EVER used the app ──
  useEffect(() => {
    if (!myName) return;
    const poll = async () => {
      try {
        const res = await fetch(PRESENCE_URL);
        if (!res.ok) throw new Error("presence fetch failed");
        const data = await res.json();
        const names: string[] = (data.users || [])
          .map((u: { name: string }) => u.name)
          .filter((n: string) => n && n !== myName);
        setOnlineNames(names);

        // Shared roster of everyone who has ever opened the app on any
        // PC — this is what makes people visible across machines even
        // when they're not currently online, instead of relying on
        // each browser's own localStorage.
        const everyone: string[] = (data.all_users || [])
          .map((u: { name: string }) => u.name)
          .filter((n: string) => n && n !== myName);
        setKnownNames(everyone);
      } catch (err) {
        console.error("Could not load online users:", err);
      }
    };
    poll();
    const interval = setInterval(poll, PRESENCE_POLL_MS);
    return () => clearInterval(interval);
  }, [myName]);

  // ── Groups: poll shared list so new/deleted groups appear for everyone ──
  useEffect(() => {
    if (!myName) return;
    const poll = async () => {
      try {
        const res = await fetch(GROUPS_URL);
        if (!res.ok) throw new Error("groups fetch failed");
        const data = await res.json();
        const serverGroups: Conversation[] = (data.groups || []).map((g: any) => ({
          id: g.id,
          label: g.label,
          avatar: g.avatar || makeAvatar(g.label),
          lastMessage: g.lastMessage || "No messages yet",
          type: "group" as const,
        }));
        if (serverGroups.length > 0 || data.groups) {
          setGroups(serverGroups);
        }
      } catch (err) {
        console.error("Could not sync groups from server (using local cache):", err);
      }
    };
    poll();
    const interval = setInterval(poll, GROUPS_POLL_MS);
    return () => clearInterval(interval);
  }, [myName]);

  // Cache groups locally as a fallback for when the server is unreachable
  useEffect(() => {
    localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(groups));
  }, [groups]);

  // Persist the "recent DM shortcuts" list
  useEffect(() => {
    localStorage.setItem(RECENT_DMS_KEY, JSON.stringify(recentDmNames));
  }, [recentDmNames]);

  const rememberRecentDm = (name: string) => {
    setRecentDmNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  useEffect(() => {
    if (addMode) addInputRef.current?.focus();
  }, [addMode]);

  // ── Derived conversation lists ──────────────────────────
  const onlinePeople: Conversation[] = onlineNames.map((n) => ({
    id: makeDmId(myName ?? "", n),
    label: n,
    avatar: makeAvatar(n),
    lastMessage: "Online now",
    type: "dm",
    online: true,
  }));

  // Everyone who's ever used the app (from the server-shared roster) OR
  // whom this browser has manually DMed, minus whoever's online right
  // now — so the People list looks the same on every PC, not just
  // whoever happens to be logged in on the machine you're viewing from.
  const offlineNames = Array.from(new Set([...knownNames, ...recentDmNames]))
    .filter((n) => n !== myName && !onlineNames.includes(n));
  const offlineRecent: Conversation[] = offlineNames.map((n) => ({
    id: makeDmId(myName ?? "", n),
    label: n,
    avatar: makeAvatar(n),
    lastMessage: "Offline",
    type: "dm" as const,
    online: false,
  }));
  const directMessages = [...onlinePeople, ...offlineRecent];
  const allConversations = [...groups, ...directMessages];
  const activeConversation = allConversations.find((c) => c.id === activeId);

  // ── Group create/delete (shared) ────────────────────────
  const openAdd = (mode: "group" | "dm") => {
    setAddMode(mode);
    setNewItemName("");
  };

  const confirmAdd = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !addMode || !myName) return;

    if (addMode === "group") {
      const existing = groups.find((g) => g.label.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        setActiveId(existing.id);
      } else {
        const newGroup: Conversation = {
          id: trimmed,
          label: trimmed,
          lastMessage: "No messages yet",
          avatar: makeAvatar(trimmed),
          type: "group",
        };
        setGroups((prev) => [...prev, newGroup]); // optimistic — others pick it up on next poll
        setActiveId(newGroup.id);
        try {
          await fetch(GROUPS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: newGroup.id, label: newGroup.label, avatar: newGroup.avatar }),
          });
        } catch (err) {
          console.error("Failed to create group on server:", err);
        }
      }
    } else {
      if (trimmed.toLowerCase() === myName.toLowerCase()) {
        setAddMode(null);
        setNewItemName("");
        return; // can't DM yourself
      }
      rememberRecentDm(trimmed);
      setActiveId(makeDmId(myName, trimmed));
    }

    setAddMode(null);
    setNewItemName("");
  };

  const deleteGroup = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setGroups((prev) => prev.filter((g) => g.id !== id)); // optimistic
    if (activeId === id) setActiveId(groups.find((g) => g.id !== id)?.id ?? "");
    try {
      await fetch(`${GROUPS_URL}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete group on server:", err);
    }
  };

  const removeRecentDm = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setRecentDmNames((prev) => prev.filter((n) => n !== name));
    const id = makeDmId(myName ?? "", name);
    if (activeId === id) setActiveId(groups[0]?.id ?? "");
  };

  const openDm = (name: string) => {
    if (!myName) return;
    rememberRecentDm(name);
    setActiveId(makeDmId(myName, name));
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmAdd();
    } else if (e.key === "Escape") {
      setAddMode(null);
      setNewItemName("");
    }
  };

  // ── Messages ─────────────────────────────────────────────
  const loadMessages = async () => {
    if (!activeId) {
      setLoadingMessages(false);
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/chat-messages?channel=${encodeURIComponent(activeId)}`
      );
      if (!response.ok) throw new Error("Could not load messages");
      const data = await response.json();
      const formatted = (data.messages || []).map((msg: ChatMessage) => ({
        ...msg,
        self: msg.sender === myName,
      }));
      setMessages(formatted);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Could not connect to backend at " + API_BASE);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!myName) return;
    setLoadingMessages(true);
    loadMessages();
    const interval = setInterval(loadMessages, MESSAGES_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, myName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingUploads]);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending || !myName || !activeId) return;
    setSending(true);
    setMessage("");
    try {
      await fetch(`${API_BASE}/chat-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: myName, channel: activeId }),
      });
      await loadMessages();
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  };

  const sendAttachmentMessage = async (attachment: Attachment) => {
    if (!myName || !activeId) return;
    try {
      await fetch(`${API_BASE}/chat-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", sender: myName, channel: activeId, attachment }),
      });
      await loadMessages();
    } catch (err) {
      console.error("Failed to post attachment message:", err);
    }
  };

  // No client-side size/type restriction — see contract notes at bottom.
  const uploadOneFile = (file: File, tempId: string) => {
    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      uploadXhrsRef.current[tempId] = xhr;
      xhr.open("POST", UPLOAD_URL);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const progress = Math.round((e.loaded / e.total) * 100);
        setPendingUploads((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, progress } : p))
        );
      };

      xhr.onload = async () => {
        delete uploadXhrsRef.current[tempId];
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const attachment: Attachment = {
              url: data.url,
              name: data.name || file.name,
              size: data.size ?? file.size,
              mime: data.mime || file.type || "application/octet-stream",
            };
            await sendAttachmentMessage(attachment);
            setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId));
          } catch {
            setPendingUploads((prev) =>
              prev.map((p) => (p.tempId === tempId ? { ...p, error: "Upload response was invalid" } : p))
            );
          }
        } else {
          setPendingUploads((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, error: `Upload failed (${xhr.status})` } : p))
          );
        }
        resolve();
      };

      xhr.onerror = () => {
        delete uploadXhrsRef.current[tempId];
        setPendingUploads((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, error: "Network error during upload" } : p))
        );
        resolve();
      };

      xhr.onabort = () => {
        delete uploadXhrsRef.current[tempId];
        resolve();
      };

      const form = new FormData();
      form.append("file", file);
      form.append("channel", activeId);
      form.append("sender", myName ?? "");
      xhr.send(form);
    });
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !myName || !activeId) return;
    const files = Array.from(fileList);
    const newPending: PendingUpload[] = files.map((f, i) => ({
      tempId: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      progress: 0,
    }));
    setPendingUploads((prev) => [...prev, ...newPending]);
    files.forEach((file, i) => uploadOneFile(file, newPending[i].tempId));
  };

  const cancelUpload = (tempId: string) => {
    uploadXhrsRef.current[tempId]?.abort();
    setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId));
  };

  const retryUpload = (tempId: string) => {
    setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId));
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const visibleMessages = messages.filter((msg) => msg.channel === activeId);

  // ── NAME ENTRY SCREEN ──────────────────────────────────
  if (!myName) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto flex items-center justify-center h-[calc(100vh-140px)]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border rounded-xl p-10 w-full max-w-sm shadow-card text-center"
          >
            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground mx-auto mb-4">
              CH
            </div>
            <h2 className="text-lg font-semibold text-card-foreground mb-1">
              Welcome to Team Chat
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your name so your teammates know it's you.
            </p>
            <Input
              placeholder="Your name..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="mb-3"
              autoFocus
            />
            <Button
              className="w-full bg-gradient-gold text-accent-foreground hover:opacity-90"
              onClick={saveName}
              disabled={!nameInput.trim()}
            >
              Enter Chat
            </Button>
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }

  const renderAvatar = (c: Conversation) => (
    <div className="relative shrink-0">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${
        c.type === "dm" ? "bg-primary/15 text-primary" : "bg-secondary text-accent"
      }`}>
        {c.avatar}
      </div>
      {c.type === "dm" && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
          c.online ? "bg-green-500" : "bg-zinc-400"
        }`} />
      )}
    </div>
  );

  // The HTML `download` attribute is silently ignored by browsers for
  // cross-origin links (our upload server runs on a different port
  // than the frontend), so a real download has to come from the
  // server forcing Content-Disposition: attachment instead.
  const buildDownloadUrl = (attachment: Attachment) => {
    const separator = attachment.url.includes("?") ? "&" : "?";
    return `${attachment.url}${separator}download=1&name=${encodeURIComponent(attachment.name)}`;
  };

  const renderAttachment = (attachment: Attachment, self: boolean) => {
    const isImage = attachment.mime.startsWith("image/");
    if (isImage) {
      return (
        <div className="relative inline-block">
          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={attachment.url}
              alt={attachment.name}
              className="rounded-xl max-w-[280px] max-h-64 w-auto h-auto object-cover border border-border/50"
              loading="lazy"
            />
          </a>
          <a
            href={buildDownloadUrl(attachment)}
            title={`Download ${attachment.name}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      );
    }
    const isArchive = /\.(zip|rar|7z|tar|gz)$/i.test(attachment.name);
    return (
      <a
        href={buildDownloadUrl(attachment)}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 min-w-[220px] max-w-[280px] border transition-colors ${
          self
            ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15"
            : "border-border bg-background/60 hover:bg-background"
        }`}
      >
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          self ? "bg-primary-foreground/15" : "bg-muted"
        }`}>
          {isArchive ? <FileArchive className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{attachment.name}</p>
          <p className="text-[10px] opacity-70">{formatBytes(attachment.size)}</p>
        </div>
        <Download className="h-3.5 w-3.5 opacity-70 shrink-0" />
      </a>
    );
  };

  // ── MAIN CHAT ──────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <motion.div
          {...fade(0)}
          className="rounded-xl border bg-card shadow-card overflow-hidden"
          style={{ height: "calc(100vh - 140px)" }}
        >
          <div className="flex h-full">
            {/* LEFT: CONVERSATION LIST */}
            <div className="w-72 border-r border-border flex flex-col shrink-0 hidden md:flex">
              <div className="p-3 border-b border-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search chats..." className="pl-9 h-9 text-sm" />
                </div>

                <AnimatePresence>
                  {addMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          ref={addInputRef}
                          placeholder={addMode === "group" ? "New group name..." : "Someone not online yet..."}
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          onKeyDown={handleAddKeyDown}
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs bg-gradient-gold text-accent-foreground hover:opacity-90 shrink-0"
                          onClick={confirmAdd}
                          disabled={!newItemName.trim()}
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          onClick={() => { setAddMode(null); setNewItemName(""); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Groups — shared/live for everyone */}
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Groups
                  </span>
                  <button
                    onClick={() => openAdd("group")}
                    title="New group (visible to everyone)"
                    className="text-muted-foreground hover:text-accent p-0.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {groups.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-2">No groups yet.</p>
                )}
                {groups.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group ${
                      activeId === c.id ? "bg-muted/40" : ""
                    }`}
                  >
                    {renderAvatar(c)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{c.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                    </div>
                    <button
                      onClick={(e) => deleteGroup(e, c.id)}
                      title="Delete group (for everyone)"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                ))}

                {/* People online — click to message directly, no adding required */}
                <div className="flex items-center justify-between px-4 pt-4 pb-1">
                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    People Online {onlinePeople.length > 0 && `(${onlinePeople.length})`}
                  </span>
                  <button
                    onClick={() => openAdd("dm")}
                    title="Message someone who isn't online right now"
                    className="text-muted-foreground hover:text-accent p-0.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {onlinePeople.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-2">No one else is online right now.</p>
                )}
                {onlinePeople.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openDm(c.label)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group ${
                      activeId === c.id ? "bg-muted/40" : ""
                    }`}
                  >
                    {renderAvatar(c)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{c.label}</p>
                      <p className="text-xs text-green-500 truncate">Online</p>
                    </div>
                  </button>
                ))}

                {/* Everyone else who's used the app (shared across all PCs) but is currently offline */}
                {offlineRecent.length > 0 && (
                  <>
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        People ({offlineRecent.length})
                      </span>
                    </div>
                    {offlineRecent.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openDm(c.label)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group ${
                          activeId === c.id ? "bg-muted/40" : ""
                        }`}
                      >
                        {renderAvatar(c)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-card-foreground truncate">{c.label}</p>
                          <p className="text-xs text-muted-foreground truncate">Offline</p>
                        </div>
                        <button
                          onClick={(e) => removeRecentDm(e, c.label)}
                          title="Remove from your recent list"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Identity badge */}
              <div className="p-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                      {myName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-2 border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-card-foreground truncate">{myName}</p>
                    <p className="text-[10px] text-green-500">● Online</p>
                  </div>
                  <button
                    onClick={signOut}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    change
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: CHAT AREA */}
            <div className="flex-1 flex flex-col min-w-0">
              {activeConversation ? (
                <>
                  <div className="h-14 border-b border-border flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                      {renderAvatar(activeConversation)}
                      <div>
                        <p className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                          {activeConversation.label}
                          {activeConversation.type === "dm" ? (
                            <User className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Users className="h-3 w-3 text-muted-foreground" />
                          )}
                        </p>
                        <p className={`text-[10px] ${
                          activeConversation.type === "dm"
                            ? activeConversation.online ? "text-green-500" : "text-muted-foreground"
                            : "text-muted-foreground"
                        }`}>
                          {activeConversation.type === "dm"
                            ? (activeConversation.online ? "Online" : "Offline")
                            : "Live • syncs every 3s"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      
                      {activeConversation.type === "group" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Delete group (for everyone)"
                          onClick={(e) => deleteGroup(e, activeConversation.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loadingMessages && (
                      <p className="text-sm text-muted-foreground text-center mt-6">Loading messages...</p>
                    )}
                    {error && (
                      <p className="text-sm text-destructive text-center mt-6">{error}</p>
                    )}
                    {!loadingMessages && !error && visibleMessages.length === 0 && pendingUploads.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center mt-6">
                        {activeConversation.type === "dm"
                          ? `No messages with ${activeConversation.label} yet.`
                          : `No messages in ${activeConversation.label} yet.`}
                      </p>
                    )}
                    {visibleMessages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.self ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[75%]">
                          {!msg.self && (
                            <p className="text-[10px] font-medium text-accent mb-1">{msg.sender}</p>
                          )}
                          {msg.attachment ? (
                            <div className={msg.self ? "flex justify-end" : ""}>
                              {renderAttachment(msg.attachment, msg.self)}
                            </div>
                          ) : (
                            <div className={`rounded-2xl px-4 py-2.5 ${
                              msg.self
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted text-card-foreground rounded-bl-md"
                            }`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            </div>
                          )}
                          <div className={`flex items-center gap-1 mt-1 ${msg.self ? "justify-end" : ""}`}>
                            <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                            {msg.self && <CheckCheck className="h-3 w-3 text-info" />}
                          </div>
                        </div>
                      </div>
                    ))}

                    {pendingUploads.map((p) => (
                      <div key={p.tempId} className="flex justify-end">
                        <div className="min-w-[220px] max-w-[280px] rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <p className="text-xs font-medium text-card-foreground truncate flex-1">{p.name}</p>
                            <button
                              onClick={() => (p.error ? retryUpload(p.tempId) : cancelUpload(p.tempId))}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {p.error ? (
                            <p className="text-[10px] text-destructive">{p.error} · tap ✕ to retry</p>
                          ) : (
                            <>
                              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${p.progress}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {formatBytes(p.size)} · {p.progress}%
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    <div ref={bottomRef} />
                  </div>

                  <div className="border-t border-border p-3">
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          handleFilesSelected(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground shrink-0"
                        title="Attach a file or image — any type, any size"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Input
                        placeholder={
                          activeConversation.type === "dm"
                            ? `Message ${activeConversation.label}...`
                            : `Message #${activeConversation.label}...`
                        }
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1"
                        disabled={sending}
                      />
                      <Button
                        size="icon"
                        className="h-9 w-9 bg-gradient-gold text-accent-foreground hover:opacity-90 shrink-0"
                        onClick={sendMessage}
                        disabled={sending || !message.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
                  <p className="text-sm text-muted-foreground mb-1">
                    No conversation selected.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => openAdd("group")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Group
                    </Button>
                    {onlinePeople.length > 0 && (
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-gradient-gold text-accent-foreground hover:opacity-90 gap-1.5"
                        onClick={() => openDm(onlinePeople[0].label)}
                      >
                        Message {onlinePeople[0].label}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;

/*
  BACKEND CONTRACT ASSUMED BY THIS FILE (adjust if yours differs):

  ── Groups (shared, so everyone sees the same list) ──
  GET    ${API_BASE}/chat-groups
    → 200 JSON: { groups: [{ id, label, avatar?, lastMessage? }] }

  POST   ${API_BASE}/chat-groups
    body: { id, label, avatar }
    → creates/upserts a group. Polled by every client every 5s, so a new
      group shows up for everyone within ~5 seconds — not instant push,
      but "live" in the same sense the existing 3s message polling is.

  DELETE ${API_BASE}/chat-groups/:id
    → removes the group for everyone.

  ── Presence (who's logged in right now, and who's ever used the app) ──
  POST ${API_BASE}/presence
    body: { name }
    → heartbeat / upsert last-seen timestamp for this name, AND records
      this name into the permanent "known users" roster. Sent every 8s
      while the tab is open.

  GET  ${API_BASE}/presence
    → 200 JSON: {
        users: [{ name, lastSeen }],       // online right now (TTL'd)
        all_users: [{ name, lastSeen }]    // everyone who's ever opened
                                            // the app, on any PC — never
                                            // TTL'd out
      }
    Server should only include users in `users` whose last heartbeat was
    recent (e.g. within the last ~20-30s) so someone who closed the tab
    disappears from the "online" list shortly after. `all_users` is
    permanent and is what makes the People list identical across PCs.

  POST ${API_BASE}/presence/leave
    body: { name }
    → best-effort explicit sign-off, sent via navigator.sendBeacon on tab
      close / "change name". Removes the person from `users` (online)
      but NOT from `all_users` — they should still show up as offline
      everywhere.

  ── Messaging / uploads (unchanged from before) ──
  GET/POST ${API_BASE}/chat-messages, POST ${API_BASE}/chat-upload — see
  earlier contract notes; DM channel ids are still "dm:NameA::NameB"
  (names sorted), so no separate DM-specific backend work is needed
  beyond what already exists for group channels.
*/
