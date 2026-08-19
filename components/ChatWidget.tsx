"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface ChatMessage {
  _id?: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
}

interface Conversation {
  _id: string;
  status: "OPEN" | "RESOLVED";
  messages: ChatMessage[];
}

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

  if (hidden || !hydrated || authLoading) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 999, fontFamily: "'DM Sans', sans-serif" }}>
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
                  conversation.messages.map((m, i) => (
                    <div key={m._id || i} style={{
                      alignSelf: m.sender === "USER" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      background: m.sender === "USER" ? C.gold : C.dark4,
                      color: m.sender === "USER" ? C.dark : C.text,
                      border: m.sender === "USER" ? "none" : `1px solid ${C.border}`,
                      borderRadius: 12,
                      borderBottomRightRadius: m.sender === "USER" ? 3 : 12,
                      borderBottomLeftRadius: m.sender === "ADMIN" ? 3 : 12,
                      padding: "8px 11px",
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {m.text}
                      <div style={{ fontSize: 9, marginTop: 3, opacity: 0.6 }}>
                        {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Composer */}
              <form onSubmit={handleSend} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
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
