"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import TypingIndicator from "@/components/TypingIndicator";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";
import { compressImageToDataUri } from "@/utils/imageCompression";

interface ChatMessage {
  _id?: string;
  sender: "USER" | "ADMIN";
  text: string;
  // URL of the picture (never the raw data) - see utils/chatSerializer.ts.
  image?: string | null;
  createdAt: string;
  editedAt?: string | null;
}

interface Conversation {
  _id: string;
  status: "OPEN" | "RESOLVED";
  messages: ChatMessage[];
  adminTypingAt?: string | null;
}

// A message the visitor just sent that the server hasn't confirmed yet (or
// failed to receive). Shown immediately so sending feels instant, then
// replaced by the real one on the next successful response.
interface OutgoingMessage {
  clientId: string;
  text: string;
  image: string | null; // data URI, local preview + payload
  failed: boolean;
}

// How long a typing ping stays "fresh" before the indicator hides itself
// again. Must comfortably outlast the poll interval below or the
// indicator would flicker off between polls while still typing.
const TYPING_TTL_MS = 6000;
// Minimum gap between typing pings sent to the server - keystrokes fire
// far faster than this, so every change would otherwise spam a request.
const TYPING_PING_THROTTLE_MS = 2000;
const COMPOSER_MAX_HEIGHT = 110;

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0",
  gold: "#C9A84C", red: "#EF4444", green: "#22C55E",
};

// One-tap starters for an empty conversation - most support requests are one
// of these, and an empty box is the hardest part of writing in.
const QUICK_TOPICS = [
  { label: "💳 Problème de paiement", text: "Bonjour, j'ai un problème avec mon paiement." },
  { label: "⭐ Mon abonnement", text: "Bonjour, j'ai une question sur mon abonnement." },
  { label: "🔑 Mon compte", text: "Bonjour, j'ai un souci avec mon compte (connexion / mot de passe)." },
  { label: "❓ Autre question", text: "Bonjour, j'ai une question." },
];

const PHONE_STORAGE_KEY = "chat_phone";
const seenStorageKey = (key: string) => `chat_seen:${key}`;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function sameDay(aIso: string, bIso: string) {
  const a = new Date(aIso), b = new Date(bIso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ChatWidget() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [lastSeen, setLastSeen] = useState<string>("1970-01-01T00:00:00.000Z");
  const [hydrated, setHydrated] = useState(false);

  // ─── Sending: optimistic messages, picture attachment ───────────────
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // ─── Edit / delete own messages ─────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);

  // ─── "Agent is typing" indicator ────────────────────────────────────
  const [nowTick, setNowTick] = useState(Date.now());
  const lastTypingPingRef = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hidden on the admin dashboard (admins reply from the Messages tab
  // there) and for admin accounts generally. Computed up front - not a
  // hook - so the effects below can skip their network work too, not
  // just the final render.
  const hidden = pathname?.startsWith("/dashboard") || user?.role === "ADMIN";

  // Identity key used both for the polling request and for the
  // per-visitor "last seen" unread marker.
  const chatKey = user ? `user:${user._id}` : phone ? `phone:${phone}` : null;
  const effectivePhone = user?.phone || phone;
  const hasIdentity = !!effectivePhone;

  // Anonymous visitors are identified by phone, which the picture URLs need
  // too (a logged-in visitor is recognised from the cookie instead).
  const imageSrc = (url: string) => (user ? url : `${url}&phone=${encodeURIComponent(effectivePhone)}`);

  // ─── Load persisted anonymous phone once we're in the browser ─────────
  useEffect(() => {
    const savedPhone = localStorage.getItem(PHONE_STORAGE_KEY) || "";
    setPhone(savedPhone);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!chatKey) return;
    setLastSeen(localStorage.getItem(seenStorageKey(chatKey)) || "1970-01-01T00:00:00.000Z");
  }, [chatKey]);

  // ─── Poll the conversation ──────────────────────────────────────────
  useEffect(() => {
    if (!hydrated || authLoading || !hasIdentity || hidden) return;
    let cancelled = false;

    const fetchConversation = async () => {
      try {
        const url = user ? "/api/chat" : `/api/chat?phone=${encodeURIComponent(effectivePhone)}`;
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) setConversation(data.data);
      } catch {
        // Silent - the widget just tries again on the next poll tick.
      }
    };

    fetchConversation();
    const interval = setInterval(fetchConversation, open ? 4000 : 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [hydrated, authLoading, hasIdentity, hidden, user, effectivePhone, open]);

  // ─── Auto-scroll to the newest message ─────────────────────────────
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [conversation?.messages.length, outgoing.length, open]);

  // ─── Mark as read whenever the panel is open ───────────────────────
  useEffect(() => {
    if (!open || !chatKey || !conversation?.messages.length) return;
    const latest = conversation.messages[conversation.messages.length - 1].createdAt;
    localStorage.setItem(seenStorageKey(chatKey), latest);
    setLastSeen(latest);
  }, [open, chatKey, conversation]);

  const unreadCount = useMemo(() => {
    if (!conversation) return 0;
    return conversation.messages.filter(
      (m) => m.sender === "ADMIN" && new Date(m.createdAt) > new Date(lastSeen)
    ).length;
  }, [conversation, lastSeen]);

  // Re-evaluate every second while the panel is open so the typing
  // indicator fades out on its own between polls, instead of only
  // updating (up to 4s late) when the next poll happens to land.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const isAdminTyping = useMemo(() => {
    if (!conversation?.adminTypingAt) return false;
    return nowTick - new Date(conversation.adminTypingAt).getTime() < TYPING_TTL_MS;
  }, [conversation?.adminTypingAt, nowTick]);

  // Auto-growing composer (up to COMPOSER_MAX_HEIGHT, then it scrolls).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft, open]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (trimmed.length < 6) return;
    localStorage.setItem(PHONE_STORAGE_KEY, trimmed);
    setPhone(trimmed);
  };

  // Sends one outgoing message; used for the first attempt and for retries.
  const deliver = async (msg: OutgoingMessage) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, text: msg.text, image: msg.image }),
      });
      const data = await res.json();
      if (data?.success) {
        setConversation(data.data);
        setOutgoing((prev) => prev.filter((o) => o.clientId !== msg.clientId));
      } else {
        setOutgoing((prev) => prev.map((o) => (o.clientId === msg.clientId ? { ...o, failed: true } : o)));
        setComposeError(data?.message || "Échec de l'envoi");
      }
    } catch {
      setOutgoing((prev) => prev.map((o) => (o.clientId === msg.clientId ? { ...o, failed: true } : o)));
      setComposeError("Erreur réseau - le message n'a pas été envoyé");
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingImage) || compressing) return;

    const msg: OutgoingMessage = {
      clientId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      image: pendingImage,
      failed: false,
    };
    setOutgoing((prev) => [...prev, msg]);
    setDraft("");
    setPendingImage(null);
    setComposeError(null);
    deliver(msg);
  };

  const retryOutgoing = (clientId: string) => {
    const msg = outgoing.find((o) => o.clientId === clientId);
    if (!msg) return;
    const retrying = { ...msg, failed: false };
    setOutgoing((prev) => prev.map((o) => (o.clientId === clientId ? retrying : o)));
    setComposeError(null);
    deliver(retrying);
  };

  const discardOutgoing = (clientId: string) => {
    setOutgoing((prev) => prev.filter((o) => o.clientId !== clientId));
    setComposeError(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setComposeError("Choisissez une image"); return; }
    setCompressing(true);
    setComposeError(null);
    try {
      setPendingImage(await compressImageToDataUri(file));
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Impossible de traiter cette image");
    } finally {
      setCompressing(false);
    }
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    setComposeError(null);
    if (!value.trim()) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    fetch("/api/chat/typing", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: effectivePhone }),
    }).catch(() => { /* best-effort - a missed ping just means a slightly late indicator */ });
  };

  // Enter sends, Shift+Enter makes a new line (like every messaging app).
  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const pickTopic = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const startEdit = (m: ChatMessage) => {
    if (!m._id) return;
    setEditingId(m._id);
    setEditText(m.text);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const saveEdit = async (m: ChatMessage) => {
    const text = editText.trim();
    if (!text && !m.image) return;
    setBusyMessageId(m._id!);
    try {
      const res = await fetch(`/api/chat/messages/${m._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, text }),
      });
      const data = await res.json();
      if (data?.success) setConversation(data.data);
    } catch { /* leave editing open so the visitor can retry */ return; }
    finally { setBusyMessageId(null); }
    setEditingId(null);
    setEditText("");
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    setBusyMessageId(id);
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone }),
      });
      const data = await res.json();
      if (data?.success) setConversation(data.data);
    } catch { /* optimistic-free - message just stays if the request failed */ }
    finally { setBusyMessageId(null); }
  };

  if (hidden || !hydrated || authLoading) return null;

  const messages = conversation?.messages ?? [];
  const isEmpty = messages.length === 0 && outgoing.length === 0;
  const canSend = (!!draft.trim() || !!pendingImage) && !compressing;

  return (
    <div style={{ position: "fixed", bottom: `calc(${BOTTOM_SAFE_OFFSET} + 12px)`, right: 20, zIndex: 999, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes chatFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .chat-panel { width: 360px; height: min(540px, calc(100dvh - 190px)); }
        @media (max-width: 420px) {
          .chat-panel { width: calc(100vw - 32px); height: min(76dvh, calc(100dvh - 170px)); }
        }
        .chat-scroll { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
        .chat-scroll::-webkit-scrollbar { width: 6px; }
        .chat-scroll::-webkit-scrollbar-thumb { background-color: ${C.border}; border-radius: 999px; }
        .chat-chip:hover { border-color: ${C.gold}; color: ${C.text}; }
      `}</style>

      {open && (
        <div className="chat-panel" style={{
          position: "absolute", bottom: 72, right: 0,
          background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)", animation: "chatFadeIn 0.2s ease",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
            <div aria-hidden style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ChatIcon color={C.gold} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Support</div>
              <div style={{ fontSize: 11, color: isAdminTyping ? C.green : C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isAdminTyping ? "Un agent écrit…" : "Nous répondons sous 24h"}
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
              <CloseIcon />
            </button>
          </div>

          {!hasIdentity ? (
            <form onSubmit={handlePhoneSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: 20 }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Bienvenue 👋</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Entrez votre numéro de téléphone pour démarrer la discussion avec notre équipe.
              </div>
              <input
                type="tel"
                required
                autoFocus
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="6XX XXX XXX"
                style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "inherit" }}
              />
              <button
                type="submit"
                disabled={phoneInput.trim().length < 6}
                style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: phoneInput.trim().length < 6 ? 0.5 : 1 }}
              >
                Démarrer la discussion
              </button>
            </form>
          ) : (
            <>
              {/* Messages */}
              <div ref={listRef} className="chat-scroll" style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "12px 12px 8px", display: "flex", flexDirection: "column" }}>
                {isEmpty ? (
                  <div style={{ margin: "auto", textAlign: "center", padding: "0 8px", width: "100%" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Comment pouvons-nous vous aider ?</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
                      Choisissez un sujet ou écrivez directement votre message.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {QUICK_TOPICS.map((t) => (
                        <button key={t.label} type="button" className="chat-chip" onClick={() => pickTopic(t.text)}
                          style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, fontSize: 12.5, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((m, i) => {
                      const prev = messages[i - 1];
                      const next = messages[i + 1];
                      const isOwn = m.sender === "USER";
                      const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                      const groupStart = newDay || !prev || prev.sender !== m.sender;
                      const groupEnd = !next || next.sender !== m.sender || !sameDay(m.createdAt, next.createdAt);
                      const isEditing = isOwn && editingId === m._id;
                      const isBusy = busyMessageId === m._id;
                      return (
                        <div key={m._id || i}>
                          {newDay && (
                            <div style={{ display: "flex", justifyContent: "center", margin: i === 0 ? "0 0 10px" : "14px 0 10px" }}>
                              <span style={{ background: C.dark3, border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontWeight: 700, padding: "3px 11px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {dayLabel(m.createdAt)}
                              </span>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: isOwn ? "flex-end" : "flex-start", marginTop: groupStart && !newDay ? 10 : 2 }}>
                            <div style={{
                              maxWidth: "82%", minWidth: 0,
                              background: isOwn ? C.gold : C.dark4,
                              color: isOwn ? C.dark : C.text,
                              border: isOwn ? "none" : `1px solid ${C.border}`,
                              borderRadius: 14,
                              borderBottomRightRadius: isOwn && groupEnd ? 4 : 14,
                              borderBottomLeftRadius: !isOwn && groupEnd ? 4 : 14,
                              padding: m.image ? 4 : "8px 11px",
                              fontSize: 13, lineHeight: 1.5,
                              opacity: isBusy ? 0.6 : 1,
                            }}>
                              {isEditing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: m.image ? "4px 7px" : 0 }}>
                                  <textarea
                                    autoFocus
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    maxLength={2000}
                                    rows={2}
                                    style={{ background: "rgba(0,0,0,0.08)", border: "none", borderRadius: 6, color: C.dark, fontSize: 13, fontFamily: "inherit", padding: "6px 8px", resize: "none", outline: "none", minWidth: 160 }}
                                  />
                                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                    <button type="button" onClick={cancelEdit} style={{ background: "transparent", border: "none", color: C.dark, opacity: 0.7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}>
                                      Annuler
                                    </button>
                                    <button type="button" onClick={() => saveEdit(m)} disabled={(!editText.trim() && !m.image) || isBusy} style={{ background: C.dark, color: C.gold, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", opacity: (!editText.trim() && !m.image) || isBusy ? 0.5 : 1 }}>
                                      OK
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {m.image && (
                                    // eslint-disable-next-line @next/next/no-img-element -- served from our own cached image route
                                    <img
                                      src={imageSrc(m.image)}
                                      alt="Image envoyée"
                                      loading="lazy"
                                      onClick={() => setLightbox(imageSrc(m.image!))}
                                      style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 240, objectFit: "cover", borderRadius: 11, cursor: "zoom-in" }}
                                    />
                                  )}
                                  {m.text && (
                                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: m.image ? "6px 7px 0" : 0 }}>{m.text}</div>
                                  )}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, padding: m.image ? "0 7px 3px" : 0 }}>
                                    <span style={{ fontSize: 9.5, opacity: 0.6 }}>
                                      {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                      {m.editedAt ? " · modifié" : ""}
                                    </span>
                                    {isOwn && m._id && (
                                      <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                                        {(m.text || !m.image) && (
                                          <button type="button" onClick={() => startEdit(m)} disabled={isBusy} aria-label="Modifier" title="Modifier" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                                            <EditIcon />
                                          </button>
                                        )}
                                        <button type="button" onClick={() => deleteMessage(m._id!)} disabled={isBusy} aria-label="Supprimer" title="Supprimer" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                                          <TrashIcon />
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Messages sent from this device that the server hasn't confirmed yet */}
                    {outgoing.map((o) => (
                      <div key={o.clientId} style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                        <div style={{ maxWidth: "82%", minWidth: 0, background: C.gold, color: C.dark, borderRadius: 14, borderBottomRightRadius: 4, padding: o.image ? 4 : "8px 11px", fontSize: 13, lineHeight: 1.5, opacity: o.failed ? 1 : 0.65 }}>
                          {o.image && (
                            // eslint-disable-next-line @next/next/no-img-element -- local preview of a data: URI
                            <img src={o.image} alt="" style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 240, objectFit: "cover", borderRadius: 11 }} />
                          )}
                          {o.text && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: o.image ? "6px 7px 0" : 0 }}>{o.text}</div>}
                          <div style={{ marginTop: 3, padding: o.image ? "0 7px 3px" : 0, fontSize: 10 }}>
                            {o.failed ? (
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ color: "#7A2222", fontWeight: 700 }}>⚠ Non envoyé</span>
                                <button type="button" onClick={() => retryOutgoing(o.clientId)} style={{ background: "none", border: "none", textDecoration: "underline", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "inherit", padding: 0, fontSize: 10 }}>Réessayer</button>
                                <button type="button" onClick={() => discardOutgoing(o.clientId)} style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", color: "inherit", opacity: 0.8, padding: 0, fontSize: 10 }}>Supprimer</button>
                              </span>
                            ) : (
                              <span style={{ opacity: 0.7 }}>Envoi…</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {isAdminTyping && (
                  <div style={{ marginTop: 8 }}>
                    <TypingIndicator align="left" bubbleColor={C.dark4} borderColor={C.border} dotColor={C.muted} />
                  </div>
                )}

                {conversation?.status === "RESOLVED" && messages.length > 0 && (
                  <div style={{ margin: "14px auto 2px", textAlign: "center", fontSize: 11, color: C.muted, lineHeight: 1.5, background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 12px" }}>
                    ✅ Conversation clôturée - écrivez un message pour la rouvrir.
                  </div>
                )}
              </div>

              {/* Composer */}
              <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px 12px", borderTop: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
                {pendingImage && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a data: URI */}
                    <img src={pendingImage} alt="Aperçu" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                    <button type="button" onClick={() => setPendingImage(null)} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      Retirer l&apos;image
                    </button>
                  </div>
                )}
                {composeError && <div style={{ fontSize: 11, color: C.red, lineHeight: 1.4 }}>{composeError}</div>}

                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  {user && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={compressing}
                        aria-label="Joindre une image"
                        title="Joindre une image"
                        style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: compressing ? "wait" : "pointer", color: C.muted, flexShrink: 0 }}
                      >
                        {compressing ? <span style={{ fontSize: 12 }}>…</span> : <ImageIcon />}
                      </button>
                    </>
                  )}
                  <textarea
                    ref={textareaRef}
                    className="chat-scroll"
                    value={draft}
                    onChange={handleDraftChange}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Écrivez votre message…"
                    maxLength={2000}
                    rows={1}
                    style={{ flex: 1, minWidth: 0, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 18, color: C.text, fontSize: 13, padding: "9px 14px", outline: "none", fontFamily: "inherit", resize: "none", lineHeight: 1.4, maxHeight: COMPOSER_MAX_HEIGHT, overflowY: "auto" }}
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Envoyer"
                    style={{ background: C.gold, color: C.dark, border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: canSend ? "pointer" : "not-allowed", flexShrink: 0, opacity: canSend ? 1 : 0.5 }}
                  >
                    <SendIcon />
                  </button>
                </div>
                {!user && (
                  <div style={{ fontSize: 10.5, color: C.muted }}>Connectez-vous pour pouvoir envoyer des images.</div>
                )}
              </form>
            </>
          )}
        </div>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served from our own cached image route */}
          <img src={lightbox} alt="Image agrandie" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer la discussion" : "Ouvrir la discussion"}
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: C.gold, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)", position: "relative",
        }}
      >
        {open ? <CloseIcon color={C.dark} /> : <ChatIcon color={C.dark} />}
        {!open && unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, background: C.red, color: "#fff",
            borderRadius: "50%", minWidth: 18, height: 18, padding: "0 4px",
            fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${C.dark}`,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

function ChatIcon({ color = "#0A0C0F", size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 5.5A2.5 2.5 0 015.5 3h13A2.5 2.5 0 0121 5.5v9a2.5 2.5 0 01-2.5 2.5H8l-5 4v-4a2.5 2.5 0 01-.5-1.5v-9z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ color = "#7A8399" }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3l8 8M11 3l-8 8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14.5 1.5L7.5 14l-2-5.5-5.5-2z" fill="#0A0C0F" />
      <path d="M14.5 1.5L5.5 8.5" stroke="#0A0C0F" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
      <path d="M9 2l2 2L4 11H2V9L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
      <path d="M2 4h9M5 4V2.5h3V4M4 4l.5 7h4l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
