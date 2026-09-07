"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import TypingIndicator from "@/components/TypingIndicator";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

interface ChatMessage {
  _id?: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
  editedAt?: string | null;
}

interface Conversation {
  _id: string;
  status: "OPEN" | "RESOLVED";
  messages: ChatMessage[];
  adminTypingAt?: string | null;
}

// How long a typing ping stays "fresh" before the indicator hides itself
// again. Must comfortably outlast the poll interval below or the
// indicator would flicker off between polls while still typing.
const TYPING_TTL_MS = 6000;
// Minimum gap between typing pings sent to the server — keystrokes fire
// far faster than this, so every change would otherwise spam a request.
const TYPING_PING_THROTTLE_MS = 2000;

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0",
  gold: "#C9A84C", red: "#EF4444",
};

const PHONE_STORAGE_KEY = "chat_phone";
const seenStorageKey = (key: string) => `chat_seen:${key}`;

export default function ChatWidget() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>("1970-01-01T00:00:00.000Z");
  const [hydrated, setHydrated] = useState(false);

  // ─── Edit / delete own messages ─────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);

  // ─── "Agent is typing" indicator ────────────────────────────────────
  const [nowTick, setNowTick] = useState(Date.now());
  const lastTypingPingRef = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);

  // Hidden on the admin dashboard (admins reply from the Messages tab
  // there) and for admin accounts generally. Computed up front — not a
  // hook — so the effects below can skip their network work too, not
  // just the final render.
  const hidden = pathname?.startsWith("/dashboard") || user?.role === "ADMIN";

  // Identity key used both for the polling request and for the
  // per-visitor "last seen" unread marker.
  const chatKey = user ? `user:${user._id}` : phone ? `phone:${phone}` : null;
  const effectivePhone = user?.phone || phone;
  const hasIdentity = !!effectivePhone;

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
        // Silent — the widget just tries again on the next poll tick.
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
  }, [conversation?.messages.length, open]);

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

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (trimmed.length < 6) return;
    localStorage.setItem(PHONE_STORAGE_KEY, trimmed);
    setPhone(trimmed);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, text }),
      });
      const data = await res.json();
      if (data?.success) setConversation(data.data);
    } catch {
      setDraft(text); // put it back so nothing is silently lost
    } finally {
      setSending(false);
    }
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);
    if (!value.trim()) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    fetch("/api/chat/typing", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: effectivePhone }),
    }).catch(() => { /* best-effort — a missed ping just means a slightly late indicator */ });
  };

  const startEdit = (m: ChatMessage) => {
    if (!m._id) return;
    setEditingId(m._id);
    setEditText(m.text);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const saveEdit = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    setBusyMessageId(id);
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, text }),
      });
      const data = await res.json();
      if (data?.success) setConversation(data.data);
    } catch { /* leave editing open so the admin can retry */ return; }
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
    } catch { /* optimistic-free — message just stays if the request failed */ }
    finally { setBusyMessageId(null); }
  };

  if (hidden || !hydrated || authLoading) return null;

  return (
    <div style={{ position: "fixed", bottom: `calc(${BOTTOM_SAFE_OFFSET} + 12px)`, right: 20, zIndex: 999, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes chatFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .chat-panel { width: 340px; height: 460px; }
        @media (max-width: 420px) {
          .chat-panel { width: calc(100vw - 32px); height: min(70vh, 520px); }
        }
      `}</style>

      {open && (
        <div className="chat-panel" style={{
          position: "absolute", bottom: 72, right: 0,
          background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 14,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)", animation: "chatFadeIn 0.2s ease",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Discussion</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Réponse sous 24h</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
              <CloseIcon />
            </button>
          </div>

          {!hasIdentity ? (
            <form onSubmit={handlePhoneSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Entrez votre numéro de téléphone pour démarrer la discussion.
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
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {!conversation || conversation.messages.length === 0 ? (
                  <div style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 12, padding: "0 16px" }}>
                    Dites-nous en quoi nous pouvons vous aider 👋
                  </div>
                ) : (
                  conversation.messages.map((m, i) => {
                    const isOwn = m.sender === "USER";
                    const isEditing = isOwn && editingId === m._id;
                    const isBusy = busyMessageId === m._id;
                    return (
                      <div key={m._id || i} style={{
                        alignSelf: isOwn ? "flex-end" : "flex-start",
                        maxWidth: "80%",
                        background: isOwn ? C.gold : C.dark4,
                        color: isOwn ? C.dark : C.text,
                        border: isOwn ? "none" : `1px solid ${C.border}`,
                        borderRadius: 12,
                        borderBottomRightRadius: isOwn ? 3 : 12,
                        borderBottomLeftRadius: m.sender === "ADMIN" ? 3 : 12,
                        padding: "8px 11px",
                        fontSize: 13,
                        lineHeight: 1.5,
                        opacity: isBusy ? 0.6 : 1,
                      }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              maxLength={2000}
                              rows={2}
                              style={{
                                background: "rgba(0,0,0,0.08)", border: "none", borderRadius: 6,
                                color: C.dark, fontSize: 13, fontFamily: "inherit", padding: "6px 8px",
                                resize: "none", outline: "none", minWidth: 160,
                              }}
                            />
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button type="button" onClick={cancelEdit} style={{ background: "transparent", border: "none", color: C.dark, opacity: 0.7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}>
                                Annuler
                              </button>
                              <button type="button" onClick={() => saveEdit(m._id!)} disabled={!editText.trim() || isBusy} style={{ background: C.dark, color: C.gold, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", opacity: !editText.trim() || isBusy ? 0.5 : 1 }}>
                                OK
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                              <span style={{ fontSize: 9, opacity: 0.6 }}>
                                {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                {m.editedAt ? " · modifié" : ""}
                              </span>
                              {isOwn && m._id && (
                                <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                  <button type="button" onClick={() => startEdit(m)} disabled={isBusy} aria-label="Modifier" title="Modifier" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                                    <EditIcon />
                                  </button>
                                  <button type="button" onClick={() => deleteMessage(m._id!)} disabled={isBusy} aria-label="Supprimer" title="Supprimer" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                                    <TrashIcon />
                                  </button>
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
                {isAdminTyping && (
                  <TypingIndicator align="left" bubbleColor={C.dark4} borderColor={C.border} dotColor={C.muted} />
                )}
              </div>

              {/* Composer */}
              <form onSubmit={handleSend} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
                <input
                  value={draft}
                  onChange={handleDraftChange}
                  placeholder="Écrivez votre message…"
                  maxLength={2000}
                  style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, padding: "9px 14px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label="Envoyer"
                  style={{ background: C.gold, color: C.dark, border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: (!draft.trim() || sending) ? 0.5 : 1 }}
                >
                  <SendIcon />
                </button>
              </form>
            </>
          )}
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

function ChatIcon({ color = "#0A0C0F" }: { color?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
