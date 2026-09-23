"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { markRoomRead } from "@/hooks/useUnreadChat";
import { compressImageToDataUri } from "@/utils/imageCompression";
import { InlineLoader } from "@/components/LoadingSpinner";
import type { GroupRoom } from "@/models/GroupMessage";

interface ReplyPreview {
  messageId: string;
  user: string;
  role: "USER" | "ADMIN";
  phone: string;
  nickname: string | null;
  text: string;
  // Set only on a locally-built (optimistic) message, where the label
  // ("Vous" / "Admin" / masked phone) was already resolved client-side
  // before the real replyTo.user/role/phone were known — see handleSend.
  label?: string;
}

interface GroupMessage {
  _id: string;
  user: string;
  phone: string; // already masked ("696****10") by the API — never the real number
  role: "USER" | "ADMIN";
  nickname: string | null; // admin-only display name, see senderLabel below
  senderBlocked: boolean; // muted by an admin — looked up live, not stored per-message
  text: string;
  image: string | null;
  replyTo: ReplyPreview | null;
  pinned: boolean;
  createdAt: string;
  editedAt?: string | null;
  // Client-only fields for a message that hasn't been confirmed by the
  // server yet (see handleSend's optimistic append) — never sent/received
  // over the wire.
  clientId?: string;
  pending?: boolean;
  failed?: boolean;
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
// tab is already open and in the foreground. Sending your own message
// feels instant regardless, via the optimistic append in handleSend.
const POLL_MS = 3000;

const MAX_IMAGE_DIMENSION = 1280; // longest side, in px, after downscaling
const MAX_IMAGE_BYTES = 1_500_000; // must match utils/groupChatImage.ts on the server
const HIGHLIGHT_MS = 1500;
// Consecutive messages from the same sender within this window are
// visually grouped (tighter spacing, name/avatar shown once) — same idea
// as WhatsApp/Telegram/Messenger.
const GROUP_GAP_MS = 5 * 60 * 1000;
const COMPOSER_MAX_HEIGHT = 120;

const starredKey = (userId: string) => `groupchat_starred:${userId}`;

function senderLabel(m: GroupMessage, currentUserId?: string) {
  if (currentUserId && m.user === currentUserId) return "Vous";
  if (m.role === "ADMIN") return m.nickname || "Admin";
  return m.phone;
}

function initialsFor(m: GroupMessage): string {
  if (m.role === "ADMIN") return "👑";
  return m.phone.slice(0, 2) || "•";
}

function sameDay(aIso: string, bIso: string) {
  const a = new Date(aIso), b = new Date(bIso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameGroup(a: GroupMessage, b: GroupMessage) {
  return (
    a.user === b.user &&
    a.role === b.role &&
    sameDay(a.createdAt, b.createdAt) &&
    Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_GAP_MS
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Rounds the two corners on the "outer" edge of a bubble based on its
// position within a consecutive group — full round at the start/end of a
// group (with a small WhatsApp-style tail at the very last message),
// tighter in between so grouped bubbles read as one continuous block.
function bubbleRadius(isOwn: boolean, groupStart: boolean, groupEnd: boolean): React.CSSProperties {
  const BIG = 14, MID = 6, TAIL = 4;
  return isOwn
    ? {
        borderTopLeftRadius: BIG, borderBottomLeftRadius: BIG,
        borderTopRightRadius: groupStart ? BIG : MID,
        borderBottomRightRadius: groupEnd ? TAIL : MID,
      }
    : {
        borderTopRightRadius: BIG, borderBottomRightRadius: BIG,
        borderTopLeftRadius: groupStart ? BIG : MID,
        borderBottomLeftRadius: groupEnd ? TAIL : MID,
      };
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
// avatars, the reply-quote block, and the pinned strip, so the same person
// reads as the same color everywhere in the room.
function accentColorFor(role: "USER" | "ADMIN", userId: string, isOwn: boolean): string | null {
  if (isOwn) return null;
  if (role === "ADMIN") return C.gold;
  return colorForUser(userId);
}

// Downscale/re-encode moved to utils/imageCompression.ts, shared with the
// admin news-post composer — see compressImageToDataUri.
const compressImage = (file: File) => compressImageToDataUri(file, { maxDimension: MAX_IMAGE_DIMENSION, maxBytes: MAX_IMAGE_BYTES });

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [starred, setStarred] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
        // A message still in flight (or that just failed) hasn't reached
        // the server yet, so it can't be in this response — keep it
        // appended after the confirmed history until it resolves, instead
        // of letting this poll wipe it off the screen.
        setMessages((prev) => {
          const inFlight = prev.filter((m) => m.pending || m.failed);
          return [...data.data, ...inFlight];
        });
        setAccessError(null);
        setAmIBlocked(!!data.amIBlocked);
        if (typeof data.onlineCount === "number") setOnlineCount(data.onlineCount);
        // Viewing the room live is the read action — same moment the tab
        // bar / room picker's unread badges key off of (see
        // hooks/useUnreadChat.ts).
        if (data.me) markRoomRead(data.me, room);
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
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = near;
    setAtBottom(near);
  };

  const jumpToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setAtBottom(true);
  };

  // Instant on first load (nothing to animate yet), smooth afterwards —
  // so a brand-new message sliding in reads as fluid, not a page reflow.
  useEffect(() => {
    const el = listRef.current;
    if (!el || loadingMessages) return;
    if (!didInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    if (nearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, loadingMessages]);

  const scrollToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
  };

  // ─── Per-message "⋮" menu ───────────────────────────────────────────────
  useEffect(() => {
    if (!openMenuId) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.closest(`[data-menu-root="${openMenuId}"]`)) return;
      }
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openMenuId]);

  // ─── Composer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

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
    textareaRef.current?.focus();
  };

  // Sends whatever payload is currently attached to a (real, already
  // logged) message id — used for both the initial send and a retry, so
  // the two never drift apart.
  const postMessage = async (payload: { text: string; image: string | null; replyTo: string | null }) => {
    const res = await fetch("/api/group-chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, ...payload }),
    });
    return res.json();
  };

  // Appends the message to the UI immediately (so sending feels instant)
  // instead of waiting on the round-trip — same idea as WhatsApp/Telegram's
  // single-clock-tick bubble. Reconciled with the server copy on success;
  // marked `failed` (with retry/discard, see FailedRow below) rather than
  // silently restoring the draft on failure, so a flaky connection doesn't
  // just make the message vanish from the compose box without explanation.
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingImage) || sending || compressing || !user) return;

    const clientId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const imageToSend = pendingImage;
    const replySnapshot = replyingTo;

    const optimistic: GroupMessage = {
      _id: clientId,
      clientId,
      user: user._id,
      phone: "",
      role: isAdmin ? "ADMIN" : "USER",
      nickname: isAdmin ? (user.nickname || null) : null,
      senderBlocked: false,
      text,
      image: imageToSend,
      replyTo: replySnapshot
        ? { messageId: replySnapshot.id, user: "", role: "USER", phone: "", nickname: null, text: replySnapshot.text, label: replySnapshot.label }
        : null,
      pinned: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setDraft("");
    setPendingImage(null);
    setReplyingTo(null);
    setError(null);
    setSending(true);

    try {
      const data = await postMessage({ text, image: imageToSend, replyTo: replySnapshot?.id ?? null });
      if (data?.success) {
        setMessages((prev) => prev.map((m) => (m.clientId === clientId ? data.data : m)));
      } else {
        setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
        setError(data?.message || "Échec de l'envoi du message");
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
      setError("Erreur réseau — le message n'a pas été envoyé");
    } finally {
      setSending(false);
    }
  };

  const retrySend = async (m: GroupMessage) => {
    setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, pending: true, failed: false } : x)));
    try {
      const data = await postMessage({ text: m.text, image: m.image, replyTo: m.replyTo?.messageId ?? null });
      if (data?.success) {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? data.data : x)));
      } else {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, pending: false, failed: true } : x)));
        setError(data?.message || "Échec de l'envoi du message");
      }
    } catch {
      setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, pending: false, failed: true } : x)));
      setError("Erreur réseau — le message n'a pas été envoyé");
    }
  };

  const discardFailed = (clientId: string) => {
    setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  const pinnedMessages = messages.filter((m) => m.pinned);
  const visibleMessages = filter === "starred" ? messages.filter((m) => starred.includes(m._id)) : messages;

  const close = onClose;

  // ─── Gated states ───────────────────────────────────────────────────────
  if (authLoading) {
    return <GatedShell><InlineLoader label="Chargement…" /></GatedShell>;
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
        @keyframes gcFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .gc-msg-enter { animation: gcFadeIn 160ms ease; }
        .gc-menu-btn { background: none; border: none; cursor: pointer; color: ${C.muted}; font-size: 16px; line-height: 1; padding: 2px 5px; border-radius: 4px; }
        .gc-menu-btn:hover { background: rgba(255,255,255,0.08); }
        .gc-menu-popover { position: absolute; top: calc(100% + 4px); right: 0; background: ${C.dark3}; border: 1px solid ${C.border}; border-radius: 10px; padding: 4px; min-width: 190px; box-shadow: 0 8px 24px rgba(0,0,0,0.45); z-index: 20; }
        .gc-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; background: none; border: none; text-align: left; padding: 8px 10px; font-size: 12px; color: ${C.text}; cursor: pointer; border-radius: 6px; font-family: inherit; }
        .gc-menu-item:hover { background: ${C.dark4}; }
        .gc-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
        .gc-menu-item.danger { color: ${C.red}; }
        .gc-fab { position: absolute; right: 16px; bottom: 16px; width: 38px; height: 38px; border-radius: 50%; background: ${C.dark4}; border: 1px solid ${C.border}; color: ${C.gold}; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
        .gc-composer-input { transition: height 0.1s ease; }
        /* Scoped (not just relying on the app-wide rule in globals.css) so
           the room's scrollable areas — the message list and the
           auto-growing composer — always get this exact thin on-theme bar
           regardless of any ancestor/global cascade quirk. */
        .gc-scroll { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
        .gc-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .gc-scroll::-webkit-scrollbar-track { background: transparent; }
        .gc-scroll::-webkit-scrollbar-thumb { background-color: ${C.border}; border-radius: 999px; }
        .gc-scroll::-webkit-scrollbar-thumb:hover { background-color: #3A4356; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text }}>{title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted }}>
              <span>{subtitle}</span>
              {onlineCount !== null && onlineCount > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#4ADE80" }}>
                  <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />
                  {onlineCount} en ligne
                </span>
              )}
            </div>
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
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="gc-scroll"
          style={{ position: "absolute", inset: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "14px 12px", display: "flex", flexDirection: "column" }}
        >
          {loadingMessages ? (
            <div style={{ margin: "auto" }}><InlineLoader size={32} label="Chargement des messages…" padding="0" /></div>
          ) : visibleMessages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 13, padding: "0 20px" }}>
              {filter === "starred" ? "Aucun message favori pour l'instant ⭐" : "Soyez le premier à écrire dans le groupe premium 👋"}
            </div>
          ) : (
            visibleMessages.map((m, i) => {
              const prev = visibleMessages[i - 1];
              const next = visibleMessages[i + 1];
              const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const groupStart = newDay || !prev || !isSameGroup(prev, m);
              const groupEnd = !next || !sameDay(m.createdAt, next.createdAt) || !isSameGroup(m, next);

              const isOwn = m.user === user._id;
              const isEditing = isOwn && editingId === m._id;
              const isBusy = busyId === m._id;
              const isStarred = starred.includes(m._id);
              const accent = accentColorFor(m.role, m.user, isOwn); // null for own messages — already unmistakable
              const time = new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

              const bubble = (
                <div
                  ref={(el) => { msgRefs.current[m._id] = el; }}
                  className={highlightedId === m._id ? "gc-highlight" : undefined}
                  style={{
                    background: isOwn ? C.gold : C.dark4, color: isOwn ? C.dark : C.text,
                    border: isOwn ? "none" : `1px solid ${C.border}`,
                    borderLeft: !isOwn && accent ? `3px solid ${accent}` : undefined,
                    ...bubbleRadius(isOwn, groupStart, groupEnd),
                    padding: "8px 11px", fontSize: 13, lineHeight: 1.5,
                    opacity: m.pending ? 0.65 : isBusy ? 0.6 : 1,
                    flex: isOwn ? undefined : 1, minWidth: 0,
                  }}
                >
                  {(groupStart || m.pinned || isStarred || (isAdmin && m.senderBlocked && !isOwn)) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, marginBottom: 3, color: isOwn ? "rgba(10,12,15,0.65)" : accent! }}>
                      {groupStart && m.role === "ADMIN" && !isOwn && <span>👑</span>}
                      {groupStart && <span>{senderLabel(m, user._id)}</span>}
                      {m.pinned && <span title="Épinglé">📌</span>}
                      {isStarred && <span title="Favori">⭐</span>}
                      {/* Visible to admins only — a muted account isn't publicly labeled to the rest of the room. */}
                      {isAdmin && m.senderBlocked && !isOwn && (
                        <span title="Bloqué du groupe" style={{ color: C.red, fontWeight: 700 }}>🚫 bloqué</span>
                      )}
                    </div>
                  )}

                  {m.replyTo && (() => {
                    const quotedIsOwn = m.replyTo.user === user._id;
                    const quotedAccent = accentColorFor(m.replyTo.role, m.replyTo.user, quotedIsOwn);
                    const quotedLabel = m.replyTo.label ?? (quotedIsOwn ? "Vous" : m.replyTo.role === "ADMIN" ? (m.replyTo.nickname || "Admin") : m.replyTo.phone);
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
                        <div style={{ fontWeight: 700, color: isOwn ? undefined : (quotedAccent ?? undefined) }}>{quotedLabel}</div>
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

                      {m.pending ? (
                        <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>Envoi…</div>
                      ) : m.failed ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: isOwn ? "#7A2222" : C.red, fontWeight: 700 }}>⚠ Échec de l&apos;envoi</span>
                          <button type="button" onClick={() => retrySend(m)} style={{ background: "none", border: "none", textDecoration: "underline", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "inherit", padding: 0 }}>Réessayer</button>
                          <button type="button" onClick={() => discardFailed(m.clientId!)} style={{ background: "none", border: "none", textDecoration: "underline", fontSize: 10, cursor: "pointer", fontFamily: "inherit", color: "inherit", opacity: 0.8, padding: 0 }}>Supprimer</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 9, opacity: 0.6 }}>
                            {time}
                            {m.editedAt ? " · modifié" : ""}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                            <IconBtn title="Répondre" onClick={() => startReply(m)} dim={isOwn}>↩</IconBtn>
                            <div style={{ position: "relative" }} data-menu-root={m._id}>
                              <button
                                type="button" className="gc-menu-btn" aria-label="Plus d'options" title="Plus d'options"
                                onClick={() => setOpenMenuId((id) => (id === m._id ? null : m._id))}
                                style={{ color: isOwn ? "inherit" : C.muted, opacity: 0.75 }}
                              >
                                ⋮
                              </button>
                              {openMenuId === m._id && (
                                <div className="gc-menu-popover">
                                  <button className="gc-menu-item" onClick={() => { toggleStar(m._id); setOpenMenuId(null); }}>
                                    <span>{isStarred ? "★" : "☆"}</span><span>{isStarred ? "Retirer des favoris" : "Ajouter aux favoris"}</span>
                                  </button>
                                  {isAdmin && (
                                    <button className="gc-menu-item" disabled={isBusy} onClick={() => { togglePin(m); setOpenMenuId(null); }}>
                                      <span>📌</span><span>{m.pinned ? "Désépingler" : "Épingler"}</span>
                                    </button>
                                  )}
                                  {isAdmin && !isOwn && (
                                    <button className="gc-menu-item danger" disabled={blockBusyUserId === m.user} onClick={() => { toggleBlock(m); setOpenMenuId(null); }}>
                                      <span>🚫</span><span>{m.senderBlocked ? "Débloquer" : "Bloquer cet utilisateur"}</span>
                                    </button>
                                  )}
                                  {isOwn && (
                                    <button className="gc-menu-item" disabled={isBusy} onClick={() => { startEdit(m); setOpenMenuId(null); }}>
                                      <span>✎</span><span>Modifier</span>
                                    </button>
                                  )}
                                  {(isOwn || isAdmin) && (
                                    <button className="gc-menu-item danger" disabled={isBusy} onClick={() => { setOpenMenuId(null); deleteMessage(m._id); }}>
                                      <span>🗑</span><span>{isAdmin && !isOwn ? "Supprimer (modération)" : "Supprimer"}</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );

              return (
                <div key={m._id}>
                  {newDay && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: i === 0 ? 0 : 18, marginBottom: 10 }}>
                      <span style={{ background: C.dark3, border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    className="gc-msg-enter"
                    style={{
                      display: "flex", alignItems: "flex-end", gap: 6,
                      justifyContent: isOwn ? "flex-end" : "flex-start",
                      marginTop: newDay ? 0 : (groupStart ? 12 : 2),
                    }}
                  >
                    {!isOwn && (
                      <div style={{ width: 24, flexShrink: 0, alignSelf: "flex-end" }}>
                        {groupEnd && <Avatar label={initialsFor(m)} color={accent ?? C.muted} />}
                      </div>
                    )}
                    <div style={{ maxWidth: "min(80%, 480px)", minWidth: 0 }}>{bubble}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!atBottom && !loadingMessages && (
          <button className="gc-fab" onClick={jumpToBottom} aria-label="Aller aux derniers messages" title="Aller aux derniers messages">
            ↓
          </button>
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

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
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
          <textarea
            ref={textareaRef}
            className="gc-composer-input gc-scroll"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={handleComposerKeyDown}
            placeholder="Écrivez au groupe…"
            maxLength={2000}
            rows={1}
            style={{
              flex: 1, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 18, color: C.text, fontSize: 13,
              padding: "9px 14px", outline: "none", fontFamily: "inherit", resize: "none", minWidth: 0,
              maxHeight: COMPOSER_MAX_HEIGHT, overflowY: "auto", lineHeight: 1.4,
            }}
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

function Avatar({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: `${color}26`, border: `1px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color,
      }}
    >
      {label}
    </div>
  );
}

function IconBtn({ children, onClick, title, dim, disabled }: { children: React.ReactNode; onClick: () => void; title: string; dim?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      style={{
        background: "none", border: "none", padding: "2px 4px", fontSize: 12, lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        color: dim ? "inherit" : C.muted,
        opacity: disabled ? 0.5 : 0.75,
      }}
    >
      {children}
    </button>
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
