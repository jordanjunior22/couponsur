"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { GroupRoom } from "@/models/GroupMessage";

interface ReplyPreview {
  messageId: string;
  user: string;
  role: "USER" | "ADMIN";
  phone: string;
  text: string;
}

interface GroupMessage {
  _id: string;
  user: string;
  phone: string; // already masked ("696****10") by the API — never the real number
  role: "USER" | "ADMIN";
  senderBlocked: boolean; // muted by an admin — looked up live, not stored per-message
  text: string;
  image: string | null;
  replyTo: ReplyPreview | null;
  pinned: boolean;
  createdAt: string;
  editedAt?: string | null;
}

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0",
  gold: "#C9A84C", red: "#EF4444",
};

// No push infrastructure exists in this project, so "real time" here means:
// poll frequently while the tab is visible, and refetch immediately the
// instant it becomes visible again (tab refocus, coming back from the OS
// app switcher, etc.) — so a user never has to manually reload to see what
// they missed. A message can still take up to POLL_MS to appear while the
// tab is already open and in the foreground.
const POLL_MS = 3000;

const MAX_IMAGE_DIMENSION = 1280; // longest side, in px, after downscaling
const MAX_IMAGE_BYTES = 1_500_000; // must match utils/groupChatImage.ts on the server
const HIGHLIGHT_MS = 1500;

const starredKey = (userId: string) => `groupchat_starred:${userId}`;

function senderLabel(m: GroupMessage, currentUserId?: string) {
  if (currentUserId && m.user === currentUserId) return "Vous";
  if (m.role === "ADMIN") return "Admin";
  return m.phone;
}

// Every regular member gets a consistent color derived from their user id
// — same idea as Slack/WhatsApp/Discord coloring names in a group — so
// "who's talking" is visible at a glance in a room with many masked-phone
// senders that would otherwise all look alike. Deterministic (a hash of
// the stable Mongo id, not random) so the same person keeps the same
// color across messages, reloads, and everyone's screen. Admins keep the
// existing gold/crown treatment instead — that's a role signal ("this is
// staff"), not an identity one, so it stays uniform across admins.
const USER_COLORS = [
  "#5B9BD5", // blue
  "#4CC9F0", // cyan
  "#43AA8B", // green
  "#8AC926", // lime
  "#F3722C", // orange
  "#EF476F", // rose
  "#9B5DE5", // purple
  "#F15BB5", // pink
  "#70C1B3", // teal
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0; // force 32-bit int, keeps this fast and stable across engines
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// The color used for a sender's label/accent — own messages don't need one
// (already unmistakable: gold bubble, right-aligned), admins are role-coded
// gold, everyone else gets their per-user color. Shared by message bubbles,
// the reply-quote block, and the pinned strip, so the same person reads as
// the same color everywhere in the room.
function accentColorFor(role: "USER" | "ADMIN", userId: string, isOwn: boolean): string | null {
  if (isOwn) return null;
  if (role === "ADMIN") return C.gold;
  return colorForUser(userId);
}

// Downscales + re-encodes an image client-side before it ever reaches the
// server — keeps the request small and keeps MongoDB storage (which the
// admin panel reports on and can clear) from ballooning on full-resolution
// phone photos.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Le navigateur ne supporte pas le traitement d'image")); return; }
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.82;
      let dataUri = canvas.toDataURL("image/jpeg", quality);
      let tries = 0;
      while (dataUri.length * 0.75 > MAX_IMAGE_BYTES && tries < 5) {
        quality = Math.max(0.3, quality - 0.15);
        dataUri = canvas.toDataURL("image/jpeg", quality);
        tries++;
      }
      if (dataUri.length * 0.75 > MAX_IMAGE_BYTES) {
        reject(new Error("Image trop volumineuse, même après compression"));
        return;
      }
      resolve(dataUri);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de charger cette image")); };
    img.src = url;
  });
}

interface GroupChatRoomProps {
  room: GroupRoom;
  title: string;
  subtitle: string;
  icon: string;
  onClose: () => void;
}

export default function GroupChatRoom({ room, title, subtitle, icon, onClose }: GroupChatRoomProps) {
  const { user, loading: authLoading, hasActiveSubscription } = useAuth();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [amIBlocked, setAmIBlocked] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; label: string; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [starred, setStarred] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Guards setState calls in fetchMessages against firing after unmount.
  // Reset to true on every effect run (not just declared once via useRef's
  // initializer) because React 18 Strict Mode (on by default for the App
  // Router since Next 13.5.1 — see reactStrictMode.md) double-invokes
  // effects in development: mount → cleanup → mount again, all before the
  // component actually unmounts. Without the reset here, that first
  // simulated cleanup would leave this permanently false, so fetchMessages
  // would bail out of every setState forever — the room's message list
  // stuck on its loading spinner indefinitely even though sends still
  // work (handleSend doesn't gate on this ref).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isAdmin = user?.role === "ADMIN";
  // "global" has no subscription gate at all — any logged-in user passes.
  const isEligible = !!user && (room === "global" || isAdmin || hasActiveSubscription());

  // ─── Fetch / poll ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-chat?room=${room}`, { credentials: "include" });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data?.success) {
        setMessages(data.data);
        setAccessError(null);
        setAmIBlocked(!!data.amIBlocked);
      } else if (res.status === 401 || res.status === 403) {
        setAccessError(data?.message || "Accès refusé");
      }
    } catch {
      // Silent — the next poll tick (or the next focus event) tries again.
    } finally {
      if (mountedRef.current) setLoadingMessages(false);
    }
  }, [room]);

  useEffect(() => {
    if (authLoading || !isEligible) {
      if (!authLoading) setLoadingMessages(false);
      return;
    }

    fetchMessages();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchMessages();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchMessages(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authLoading, isEligible, fetchMessages]);

  // ─── Starred (personal, per-device — no server round-trip needed) ──────
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(starredKey(user._id));
      setStarred(raw ? JSON.parse(raw) : []);
    } catch { /* private browsing etc. — starring just won't persist */ }
  }, [user]);

  const toggleStar = (id: string) => {
    if (!user) return;
    setStarred((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(starredKey(user._id), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // ─── Scroll behavior ────────────────────────────────────────────────────
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    if (nearBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const scrollToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
  };

  // ─── Composer ───────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sélectionnez une image");
      return;
    }
    setCompressing(true);
    setError(null);
    try {
      setPendingImage(await compressImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de traiter cette image");
    } finally {
      setCompressing(false);
    }
  };

  const startReply = (m: GroupMessage) => {
    setReplyingTo({
      id: m._id,
      label: senderLabel(m, user?._id),
      text: m.text || (m.image ? "📷 Image" : ""),
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingImage) || sending || compressing) return;

    setSending(true);
    setError(null);
    const imageToSend = pendingImage;
    const replySnapshot = replyingTo;
    setDraft("");
    setPendingImage(null);
    setReplyingTo(null);

    try {
      const res = await fetch("/api/group-chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, text, image: imageToSend, replyTo: replySnapshot?.id ?? null }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessages((prev) => [...prev, data.data]);
        nearBottomRef.current = true;
      } else {
        setError(data?.message || "Échec de l'envoi du message");
        setDraft(text);
        setPendingImage(imageToSend);
        setReplyingTo(replySnapshot);
      }
    } catch {
      setError("Erreur réseau — le message n'a pas été envoyé");
      setDraft(text);
      setPendingImage(imageToSend);
      setReplyingTo(replySnapshot);
    } finally {
      setSending(false);
    }
  };

  const startEdit = (m: GroupMessage) => { setEditingId(m._id); setEditText(m.text); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const saveEdit = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/group-chat/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.success) setMessages((prev) => prev.map((m) => (m._id === id ? data.data : m)));
    } catch { return; }
    finally { setBusyId(null); }
    setEditingId(null);
    setEditText("");
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/group-chat/${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data?.success) setMessages((prev) => prev.filter((m) => m._id !== id));
    } catch { /* message just stays if the request failed */ }
    finally { setBusyId(null); }
  };

  const togglePin = async (m: GroupMessage) => {
    setBusyId(m._id);
    try {
      const res = await fetch(`/api/group-chat/${m._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !m.pinned }),
      });
      const data = await res.json();
      if (data?.success) setMessages((prev) => prev.map((x) => (x._id === m._id ? data.data : x)));
    } catch { /* ignore */ }
    finally { setBusyId(null); }
  };

  // Blocking is per-account, not per-message — flip `senderBlocked` on
  // every message from that user so the UI (icon, badge) updates
  // immediately instead of waiting for the next poll.
  const [blockBusyUserId, setBlockBusyUserId] = useState<string | null>(null);
  const toggleBlock = async (m: GroupMessage) => {
    const nextBlocked = !m.senderBlocked;
    setBlockBusyUserId(m.user);
    try {
      const res = await fetch(`/api/admin/users/${m.user}/group-chat-block`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessages((prev) => prev.map((x) => (x.user === m.user ? { ...x, senderBlocked: nextBlocked } : x)));
      } else {
        setError(data?.message || "Échec de l'opération");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setBlockBusyUserId(null);
    }
  };

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);
  const visibleMessages = filter === "starred" ? messages.filter((m) => starred.includes(m._id)) : messages;

  const close = onClose;

  // ─── Gated states ───────────────────────────────────────────────────────
  if (authLoading) {
    return <GatedShell><Spinner /></GatedShell>;
  }
  if (!user) {
    return (
      <GatedShell onClose={close}>
        <GatedCard
          icon="🔒"
          title="Connexion requise"
          text={`Connectez-vous pour rejoindre ${title}.`}
          onHome={close}
        />
      </GatedShell>
    );
  }
  if (!isEligible) {
    return (
      <GatedShell onClose={close}>
        <GatedCard
          icon="👑"
          title="Réservé aux abonnés premium"
          text="Le groupe de discussion premium est réservé aux membres avec un abonnement actif."
          onHome={close}
        />
      </GatedShell>
    );
  }
  if (accessError) {
    return (
      <GatedShell onClose={close}>
        <GatedCard icon="⚠️" title="Indisponible" text={accessError} onHome={close} />
      </GatedShell>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.dark, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes groupChatHighlight { 0%, 100% { background: transparent; } 40% { background: rgba(201,168,76,0.18); } }
        .gc-highlight { animation: groupChatHighlight ${HIGHLIGHT_MS}ms ease; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text }}>{title}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setFilter((f) => (f === "all" ? "starred" : "all"))}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: filter === "starred" ? "rgba(201,168,76,0.15)" : C.dark4,
              border: `1px solid ${filter === "starred" ? C.gold : C.border}`, borderRadius: 8, padding: "6px 10px",
              color: filter === "starred" ? C.gold : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ⭐ {filter === "starred" ? "Favoris" : "Tout voir"}
          </button>
          <button onClick={close} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Pinned strip */}
      {pinnedMessages.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(201,168,76,0.06)", flexShrink: 0 }}>
          <button
            onClick={() => setPinnedOpen((o) => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", color: C.gold, fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span>📌 {pinnedMessages.length} message{pinnedMessages.length > 1 ? "s" : ""} épinglé{pinnedMessages.length > 1 ? "s" : ""}</span>
            <span>{pinnedOpen ? "▲" : "▼"}</span>
          </button>
          {pinnedOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px 10px" }}>
              {pinnedMessages.map((m) => {
                const pinnedIsOwn = m.user === user._id;
                const pinnedAccent = accentColorFor(m.role, m.user, pinnedIsOwn) ?? C.gold;
                return (
                  <button
                    key={m._id}
                    onClick={() => scrollToMessage(m._id)}
                    style={{ textAlign: "left", background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: pinnedAccent, marginBottom: 2 }}>{senderLabel(m, user._id)}</div>
                    <div style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text || "📷 Image"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loadingMessages ? (
          <div style={{ margin: "auto" }}><Spinner /></div>
        ) : visibleMessages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 13, padding: "0 20px" }}>
            {filter === "starred" ? "Aucun message favori pour l'instant ⭐" : "Soyez le premier à écrire dans le groupe premium 👋"}
          </div>
        ) : (
          visibleMessages.map((m) => {
            const isOwn = m.user === user._id;
            const isEditing = isOwn && editingId === m._id;
            const isBusy = busyId === m._id;
            const isStarred = starred.includes(m._id);
            const accent = accentColorFor(m.role, m.user, isOwn); // null for own messages — already unmistakable
            return (
              <div
                key={m._id}
                ref={(el) => { msgRefs.current[m._id] = el; }}
                className={highlightedId === m._id ? "gc-highlight" : undefined}
                style={{
                  alignSelf: isOwn ? "flex-end" : "flex-start", maxWidth: "min(78%, 480px)",
                  background: isOwn ? C.gold : C.dark4, color: isOwn ? C.dark : C.text,
                  border: isOwn ? "none" : `1px solid ${C.border}`,
                  borderLeft: !isOwn && accent ? `3px solid ${accent}` : undefined,
                  borderRadius: 12, borderBottomRightRadius: isOwn ? 3 : 12, borderBottomLeftRadius: !isOwn ? 3 : 12,
                  padding: "8px 11px", fontSize: 13, lineHeight: 1.5, opacity: isBusy ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, marginBottom: 3, color: isOwn ? "rgba(10,12,15,0.65)" : accent! }}>
                  {m.role === "ADMIN" && !isOwn && <span>👑</span>}
                  {senderLabel(m, user._id)}
                  {m.pinned && <span title="Épinglé">📌</span>}
                  {/* Visible to admins only — a muted account isn't publicly labeled to the rest of the room. */}
                  {isAdmin && m.senderBlocked && !isOwn && (
                    <span title="Bloqué du groupe" style={{ color: C.red, fontWeight: 700 }}>🚫 bloqué</span>
                  )}
                </div>

                {m.replyTo && (() => {
                  const quotedIsOwn = m.replyTo.user === user._id;
                  const quotedAccent = accentColorFor(m.replyTo.role, m.replyTo.user, quotedIsOwn);
                  return (
                    <button
                      onClick={() => scrollToMessage(m.replyTo!.messageId)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                        background: isOwn ? "rgba(10,12,15,0.1)" : "rgba(255,255,255,0.05)",
                        borderLeft: `2px solid ${isOwn ? "rgba(10,12,15,0.4)" : (quotedAccent ?? C.gold)}`, border: "none", borderRadius: 4,
                        padding: "4px 8px", marginBottom: 6, fontSize: 11, opacity: 0.85,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: isOwn ? undefined : (quotedAccent ?? undefined) }}>
                        {quotedIsOwn ? "Vous" : m.replyTo.role === "ADMIN" ? "Admin" : m.replyTo.phone}
                      </div>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.replyTo.text || "📷 Image"}</div>
                    </button>
                  );
                })()}

                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea
                      autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={2000} rows={2}
                      style={{ background: "rgba(0,0,0,0.08)", border: "none", borderRadius: 6, color: C.dark, fontSize: 13, fontFamily: "inherit", padding: "6px 8px", resize: "none", outline: "none", minWidth: 180 }}
                    />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button type="button" onClick={cancelEdit} style={{ background: "transparent", border: "none", color: C.dark, opacity: 0.7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}>Annuler</button>
                      <button type="button" onClick={() => saveEdit(m._id)} disabled={!editText.trim() || isBusy} style={{ background: C.dark, color: C.gold, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", opacity: !editText.trim() || isBusy ? 0.5 : 1 }}>OK</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image can't optimize it anyway
                      <img
                        src={m.image}
                        alt="Image partagée"
                        onClick={() => setLightboxImage(m.image)}
                        style={{ display: "block", maxWidth: "100%", maxHeight: 260, borderRadius: 8, marginBottom: m.text ? 6 : 2, cursor: "zoom-in" }}
                      />
                    )}
                    {m.text && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>}

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9, opacity: 0.6 }}>
                        {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        {m.editedAt ? " · modifié" : ""}
                      </span>
                      <span style={{ display: "flex", gap: 7, marginLeft: "auto" }}>
                        <IconBtn title="Répondre" onClick={() => startReply(m)} dim={isOwn}>↩</IconBtn>
                        <IconBtn title={isStarred ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => toggleStar(m._id)} dim={isOwn} active={isStarred}>{isStarred ? "★" : "☆"}</IconBtn>
                        {isAdmin && (
                          <IconBtn title={m.pinned ? "Désépingler" : "Épingler"} onClick={() => togglePin(m)} dim={isOwn} disabled={isBusy} active={m.pinned}>📌</IconBtn>
                        )}
                        {isAdmin && !isOwn && (
                          <IconBtn
                            title={m.senderBlocked ? "Débloquer cet utilisateur" : "Bloquer cet utilisateur (ne pourra plus envoyer de messages)"}
                            onClick={() => toggleBlock(m)}
                            disabled={blockBusyUserId === m.user}
                            active={m.senderBlocked}
                            activeColor={C.red}
                          >
                            🚫
                          </IconBtn>
                        )}
                        {isOwn && (
                          <IconBtn title="Modifier" onClick={() => startEdit(m)} dim disabled={isBusy}>✎</IconBtn>
                        )}
                        {(isOwn || isAdmin) && (
                          <IconBtn title={isAdmin && !isOwn ? "Supprimer (modération)" : "Supprimer"} onClick={() => deleteMessage(m._id)} dim={isOwn} disabled={isBusy}>🗑</IconBtn>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      {amIBlocked ? (
        <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0, textAlign: "center", fontSize: 12, color: C.red }}>
          🚫 Vous avez été bloqué de ce groupe par un administrateur — vous pouvez toujours lire les messages, mais plus en envoyer.
        </div>
      ) : (
      <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderTop: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
        {replyingTo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.dark4, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 6, padding: "6px 10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.gold }}>Réponse à {replyingTo.label}</div>
              <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyingTo.text}</div>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {pendingImage && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image can't optimize it anyway */}
            <img src={pendingImage} alt="Aperçu" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
            <button type="button" onClick={() => setPendingImage(null)} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              Retirer l&apos;image
            </button>
          </div>
        )}

        {error && <div style={{ fontSize: 11, color: C.red }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={compressing}
            aria-label="Joindre une image"
            title="Joindre une image"
            style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: compressing ? "wait" : "pointer", color: C.muted, flexShrink: 0, fontSize: 15 }}
          >
            {compressing ? "…" : "📎"}
          </button>
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            placeholder="Écrivez au groupe…"
            maxLength={2000}
            style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, padding: "9px 14px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !pendingImage) || sending || compressing}
            aria-label="Envoyer"
            style={{ background: C.gold, color: C.dark, border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: ((!draft.trim() && !pendingImage) || sending || compressing) ? 0.5 : 1, fontSize: 15 }}
          >
            ➤
          </button>
        </div>
      </form>
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image can't optimize it anyway */}
          <img src={lightboxImage} alt="Image agrandie" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, dim, active, activeColor = C.gold, disabled }: { children: React.ReactNode; onClick: () => void; title: string; dim?: boolean; active?: boolean; activeColor?: string; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      style={{
        background: "none", border: "none", padding: 0, fontSize: 12, lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        color: active ? activeColor : (dim ? "inherit" : C.muted),
        opacity: disabled ? 0.5 : (active ? 1 : 0.7),
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "gcSpin 0.7s linear infinite" }}>
      <style>{`@keyframes gcSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function GatedShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div style={{ height: "100%", background: C.dark, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
      {onClose && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: 16 }}>
          <button onClick={onClose} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>✕</button>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</div>
    </div>
  );
}

function GatedCard({ icon, title, text, onHome }: { icon: string; title: string; text: string; onHome: () => void }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 360 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: C.text, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>{text}</div>
      <button
        onClick={onHome}
        style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
      >
        Retour à l&apos;accueil
      </button>
    </div>
  );
}
