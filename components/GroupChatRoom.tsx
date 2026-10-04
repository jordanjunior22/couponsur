"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PiPaperclipBold, PiPaperPlaneRightFill, PiArrowDownBold, PiArrowLeftBold, PiStarFill, PiStarBold, PiXBold,
  PiArrowBendUpLeftBold, PiCopyBold, PiFlagBold, PiPushPinBold, PiPushPinSlashBold, PiTrashBold,
  PiPencilSimpleBold, PiProhibitBold, PiCheckCircleBold, PiDotsThreeBold, PiDotsThreeVerticalBold,
  PiCaretRightBold, PiCaretLeftBold, PiLightbulbBold,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { markRoomRead } from "@/hooks/useUnreadChat";
import { compressImageToDataUri } from "@/utils/imageCompression";
import { InlineLoader } from "@/components/LoadingSpinner";
import type { GroupRoom } from "@/models/GroupMessage";
import { REACTION_EMOJIS } from "@/utils/groupChatSerializer";

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
  reactions: { emoji: string; count: number; mine: boolean }[];
  // Admins only: how many members flagged this message. For everyone else it
  // is always 0 - they just learn whether THEY already reported it.
  reportCount: number;
  reportedByMe: boolean;
  createdAt: string;
  updatedAt?: string;
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
// Slow reconcile tier — catches remote edits/deletes/pins/block-status
// changes, which the fast POLL_MS tier's `since` query can't see (see
// fetchMessages/fetchNewMessages below). 10x less frequent than the old
// single-tier poll, but a tab left open and foregrounded still self-heals
// within half a minute instead of only on refocus.
const FULL_RECONCILE_MS = 30000;

const MAX_IMAGE_DIMENSION = 1280; // longest side, in px, after downscaling
const MAX_IMAGE_BYTES = 1_500_000; // must match utils/groupChatImage.ts on the server
const HIGHLIGHT_MS = 1500;
// Consecutive messages from the same sender within this window are
// visually grouped (tighter spacing, name/avatar shown once) — same idea
// as WhatsApp/Telegram/Messenger.
const GROUP_GAP_MS = 5 * 60 * 1000;
const COMPOSER_MAX_HEIGHT = 120;
// Per-message "..." menu: its on-screen width, the screen-edge margin it must
// keep, and a generous estimate of its tallest form (used only to decide
// whether it opens below or above the button).
const MENU_WIDTH = 230;
const MENU_MARGIN = 8;
const MENU_EST_HEIGHT = 240;

const starredKey = (userId: string) => `groupchat_starred:${userId}`;

// Newest `updatedAt` (falling back to createdAt) across a batch - what the
// fast poll sends as `since` so it hears about new messages AND edits / pins /
// reactions on existing ones.
function maxUpdatedAt(list: { createdAt: string; updatedAt?: string }[], current: string | null): string | null {
  let best = current;
  for (const m of list) {
    const t = m.updatedAt ?? m.createdAt;
    if (!best || t > best) best = t;
  }
  return best;
}

// Keeps the first occurrence of each _id. A message can reach the screen
// twice - once from the poll, once from its own send response - whichever
// lands second must not leave a duplicate.
function dedupeById<T extends { _id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m._id) ? false : (seen.add(m._id), true)));
}

// Applies "I tapped this emoji" to a message locally, before the server
// answers (and again if it has to be undone).
function withToggledReaction(m: GroupMessage, emoji: string): GroupMessage {
  const existing = m.reactions.find((r) => r.emoji === emoji);
  let reactions: GroupMessage["reactions"];
  if (!existing) {
    reactions = [...m.reactions, { emoji, count: 1, mine: true }];
  } else if (existing.mine) {
    reactions =
      existing.count <= 1
        ? m.reactions.filter((r) => r.emoji !== emoji)
        : m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r));
  } else {
    reactions = m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
  }
  const order = (e: string) => (REACTION_EMOJIS as readonly string[]).indexOf(e);
  return { ...m, reactions: reactions.sort((a, b) => order(a.emoji) - order(b.emoji)) };
}
const draftStorageKey = (room: string, userId: string) => `groupchat_draft:${room}:${userId}`;

// Gestures (touch only - desktop has the ⋮ button and right-click):
//   swipe a message sideways past SWIPE_THRESHOLD to reply to it,
//   press and hold for LONG_PRESS_MS to open its action menu.
const SWIPE_THRESHOLD = 56; // px of drag that counts as "reply"
const SWIPE_MAX = 72; // px the bubble is allowed to travel
const LONG_PRESS_MS = 420;
const GESTURE_SLOP = 10; // px of movement before we decide swipe vs scroll vs hold

// Tiny haptic tick where the device supports it (most Android browsers;
// silently nothing on iOS/desktop).
function buzz(ms: number) {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms); } catch { /* ignore */ }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// Turns http(s) links in a message into tappable links. Everything else stays
// plain text (React escapes it), and only http/https is ever linked.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

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
  // Gesture bookkeeping lives in refs (a swipe updates the DOM directly -
  // re-rendering the whole message list on every pixel of a drag would stutter).
  const gestureRef = useRef<{
    id: string; startX: number; startY: number; dir: 1 | -1; el: HTMLElement;
    mode: "pending" | "swipe" | "cancel" | "long"; timer: ReturnType<typeof setTimeout> | null; offset: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const menuOpenedAtRef = useRef(0);
  // The menu shows the everyday actions first; moderation / less common ones
  // sit behind "Plus".
  const [menuMore, setMenuMore] = useState(false);
  // One-time tip about the touch gestures.
  const [showHint, setShowHint] = useState(false);
  // Names of other members currently typing (from the poll).
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingPingRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // New messages from others that arrived while scrolled up (shown on the ↓ button).
  const [unseenBelow, setUnseenBelow] = useState(0);
  const prevLenRef = useRef(0);
  // Where the open menu sits on screen (fixed coordinates) - see openMenuFor.
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const [starred, setStarred] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  // ─── Older history (loaded on demand as the reader scrolls up) ──────────
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const messagesRef = useRef<GroupMessage[]>([]);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Set while older messages are being prepended, so the auto-scroll /
  // "new messages" logic doesn't mistake them for fresh arrivals, and so the
  // scroll position can be pinned to what the reader was looking at.
  const prependingRef = useRef(false);
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const initialLoadDoneRef = useRef(false);

  // ─── Pause between messages (set by the admins; 0 = none) ─────────────
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const nextAllowedRef = useRef(0);

  // ─── Who's online sheet ─────────────────────────────────────────────────
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<{ user: string; role: "USER" | "ADMIN"; label: string; isMe: boolean }[]>([]);
  const [onlineTotal, setOnlineTotal] = useState(0);
  const [onlineLoading, setOnlineLoading] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Newest `updatedAt` this client has seen — what the fast poll tier sends
  // as `since` so the server answers "anything new OR changed?" (new
  // messages, edits, pins, reactions, reports) instead of re-sending the
  // whole window every 3s. Null until the first fetch lands (or forever, for
  // an empty room).
  const latestUpdatedAtRef = useRef<string | null>(null);
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

  // While the room is open, stop the page itself from panning or bouncing
  // sideways (the iOS/Android "whole screen drifts left and right" feel).
  // Restored when the room closes.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflowX: html.style.overflowX, htmlOverscrollX: html.style.overscrollBehaviorX,
      bodyOverflowX: body.style.overflowX, bodyOverscrollX: body.style.overscrollBehaviorX,
    };
    html.style.overflowX = "hidden";
    html.style.overscrollBehaviorX = "none";
    body.style.overflowX = "hidden";
    body.style.overscrollBehaviorX = "none";
    return () => {
      html.style.overflowX = prev.htmlOverflowX;
      html.style.overscrollBehaviorX = prev.htmlOverscrollX;
      body.style.overflowX = prev.bodyOverflowX;
      body.style.overscrollBehaviorX = prev.bodyOverscrollX;
    };
  }, []);

  // ─── Fetch / poll ───────────────────────────────────────────────────────
  // Two-tier poll, not one: a plain "re-fetch the last 200 every 3s" was
  // re-masking and re-serializing the whole window — inline images
  // included — on every tick even when nothing had changed. Now:
  //   - fetchMessages (full reconcile) — unchanged behavior, replaces
  //     state wholesale. Runs on initial load, tab refocus, and a slow
  //     background tier, so remote edits/deletes/pins/block-status
  //     changes (invisible to a `since` query — see the API route's own
  //     comment) still show up within a bounded time.
  //   - fetchNewMessages (fast tier) — cheap "anything new?" poll every
  //     POLL_MS, only ever appends. Can't clobber an in-progress local
  //     edit or race the full reconcile, since it never replaces state.
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
          const confirmed: GroupMessage[] = data.data;
          // Older pages the reader already scrolled back to stay put - the
          // refresh only replaces the latest window.
          const windowStart = confirmed.length > 0 ? confirmed[0].createdAt : null;
          const older = windowStart ? prev.filter((m) => !m.pending && !m.failed && m.createdAt < windowStart) : [];
          return [...older, ...confirmed, ...inFlight];
        });
        if (!initialLoadDoneRef.current) {
          initialLoadDoneRef.current = true;
          setHasMoreOlder(!!data.hasMore);
        }
        if (typeof data.cooldownSeconds === "number") setCooldownSeconds(data.cooldownSeconds);
        if (Array.isArray(data.typing)) setTypingNames(data.typing);
        setAccessError(null);
        setAmIBlocked(!!data.amIBlocked);
        if (typeof data.onlineCount === "number") setOnlineCount(data.onlineCount);
        // Viewing the room live is the read action — same moment the tab
        // bar / room picker's unread badges key off of (see
        // hooks/useUnreadChat.ts).
        if (data.me) markRoomRead(data.me, room);
        latestUpdatedAtRef.current = maxUpdatedAt(data.data as GroupMessage[], latestUpdatedAtRef.current);
      } else if (res.status === 401 || res.status === 403) {
        setAccessError(data?.message || "Accès refusé");
      }
    } catch {
      // Silent — the next poll tick (or the next focus event) tries again.
    } finally {
      if (mountedRef.current) setLoadingMessages(false);
    }
  }, [room]);

  const fetchNewMessages = useCallback(async () => {
    // Nothing to diff against yet (very first tick, or a room that's had
    // zero messages ever) — fall back to a full fetch instead of sending
    // a meaningless `since`.
    if (!latestUpdatedAtRef.current) return fetchMessages();
    try {
      const params = new URLSearchParams({ room, since: latestUpdatedAtRef.current });
      const res = await fetch(`/api/group-chat?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!mountedRef.current || !data?.success) return;
      setAmIBlocked(!!data.amIBlocked);
      if (typeof data.onlineCount === "number") setOnlineCount(data.onlineCount);
      if (typeof data.cooldownSeconds === "number") setCooldownSeconds(data.cooldownSeconds);
      if (Array.isArray(data.typing)) setTypingNames(data.typing);
      if (data.me) markRoomRead(data.me, room);
      const fresh: GroupMessage[] = data.data;
      if (fresh.length === 0) return;
      setMessages((prev) => {
        const freshById = new Map(fresh.map((m) => [m._id, m]));
        const known = new Set(prev.map((m) => m._id));
        const toAppend = fresh.filter((m) => !known.has(m._id));
        // Messages that changed (edit / pin / reaction / report) are replaced
        // in place; brand-new ones go on the end.
        const confirmed = prev.filter((m) => !m.pending && !m.failed).map((m) => freshById.get(m._id) ?? m);
        const inFlight = prev.filter((m) => m.pending || m.failed);
        return [...confirmed, ...toAppend, ...inFlight];
      });
      latestUpdatedAtRef.current = maxUpdatedAt(fresh, latestUpdatedAtRef.current);
    } catch {
      // Silent — the next poll tick tries again.
    }
  }, [room, fetchMessages]);

  useEffect(() => {
    if (authLoading || !isEligible) {
      if (!authLoading) setLoadingMessages(false);
      return;
    }

    fetchMessages();
    const fastInterval = setInterval(() => {
      if (document.visibilityState === "visible") fetchNewMessages();
    }, POLL_MS);
    const reconcileInterval = setInterval(() => {
      if (document.visibilityState === "visible") fetchMessages();
    }, FULL_RECONCILE_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchMessages(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(fastInterval);
      clearInterval(reconcileInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authLoading, isEligible, fetchMessages, fetchNewMessages]);

  // ─── Profile pictures ───────────────────────────────────────────────────
  // Fetched once per sender (not repeated on every polled message) and
  // cached for the life of the room. A value of null means "checked — no
  // picture", so those senders aren't asked about again. A picture someone
  // changes mid-session shows up the next time the room is opened.
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const requestedAvatarsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isEligible) return;
    const missing = Array.from(
      new Set(
        messages
          .filter((m) => !m.pending && !m.failed && m.user !== user?._id && !requestedAvatarsRef.current.has(m.user))
          .map((m) => m.user)
      )
    );
    if (missing.length === 0) return;

    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      batch.forEach((id) => requestedAvatarsRef.current.add(id));
      fetch(`/api/group-chat/avatars?room=${room}&ids=${batch.join(",")}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (!mountedRef.current || !data?.success) return;
          setAvatars((prev) => {
            const next = { ...prev };
            for (const id of batch) next[id] = data.avatars?.[id] ?? null;
            return next;
          });
        })
        .catch(() => {
          // Let a later render retry these instead of marking them "no picture".
          batch.forEach((id) => requestedAvatarsRef.current.delete(id));
        });
    }
  }, [messages, isEligible, room, user?._id]);

  // ─── Unsent draft: survives leaving the room / refreshing the page ──────
  const draftKey = user ? draftStorageKey(room, user._id) : null;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setDraft(saved);
    } catch { /* private browsing etc. - the draft just won't persist */ }
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      try {
        if (draft) localStorage.setItem(draftKey, draft);
        else localStorage.removeItem(draftKey);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [draft, draftKey]);

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
    if (near) setUnseenBelow(0);
  };

  const jumpToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setAtBottom(true);
    setUnseenBelow(0);
  };

  // Counts messages from others that land while the reader is scrolled up, so
  // the ↓ button can say "3" instead of silently piling them up out of view.
  useEffect(() => {
    const added = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;
    if (loadingMessages || !didInitialScrollRef.current || added <= 0 || nearBottomRef.current || prependingRef.current) return;
    const fromOthers = messages.slice(-added).filter((m) => m.user !== user?._id && !m.pending && !m.failed).length;
    if (fromOthers > 0) setUnseenBelow((c) => c + fromOthers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loadingMessages]);

  useEffect(() => {
    try {
      if (window.matchMedia("(pointer: coarse)").matches && !localStorage.getItem("groupchat_hint_seen")) {
        setShowHint(true);
      }
    } catch { /* storage / matchMedia unavailable - just no hint */ }
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    try { localStorage.setItem("groupchat_hint_seen", "1"); } catch { /* ignore */ }
  };

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1600);
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
    // Older messages were just added above - the scroll position is pinned by
    // the layout effect below; never jump the reader to the bottom for them.
    if (prependingRef.current) {
      prependingRef.current = false;
      return;
    }
    if (nearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, loadingMessages]);

  // ─── Older history ──────────────────────────────────────────────────────
  messagesRef.current = messages;

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;
    const oldest = messagesRef.current.find((m) => !m.pending && !m.failed);
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = listRef.current;
    scrollAnchorRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
    try {
      const params = new URLSearchParams({ room, before: oldest.createdAt });
      const res = await fetch(`/api/group-chat?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data?.success) {
        const older: GroupMessage[] = data.data;
        setHasMoreOlder(!!data.hasMore);
        const known = new Set(messagesRef.current.map((m) => m._id));
        const toPrepend = older.filter((m) => !known.has(m._id));
        if (toPrepend.length > 0) {
          prependingRef.current = true;
          setMessages((prev) => [...toPrepend, ...prev]);
        } else {
          scrollAnchorRef.current = null;
        }
      } else {
        scrollAnchorRef.current = null;
      }
    } catch {
      scrollAnchorRef.current = null;
    } finally {
      loadingOlderRef.current = false;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [room]);

  // After older messages are added ABOVE, keep the reader looking at the same
  // message instead of letting the content shove them upward.
  useLayoutEffect(() => {
    const a = scrollAnchorRef.current;
    const el = listRef.current;
    if (a && el && prependingRef.current) {
      el.scrollTop = a.top + (el.scrollHeight - a.height);
      scrollAnchorRef.current = null;
    }
  }, [messages]);

  // Auto-load the next page when the "earlier messages" row scrolls into view.
  // Re-created when a load finishes so a row that is STILL visible (short
  // pages) triggers the next one.
  useEffect(() => {
    const el = topSentinelRef.current;
    const root = listRef.current;
    if (!el || !root || !hasMoreOlder || loadingOlder || loadingMessages) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadOlder(); },
      { root, rootMargin: "120px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreOlder, loadingOlder, loadingMessages, loadOlder]);

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
        // A press-and-hold opens the menu while the finger is still down; the
        // browser can then fire a compatibility "mousedown" on release that
        // would instantly close it again.
        if (Date.now() - menuOpenedAtRef.current < 450) return;
        const target = e.target as HTMLElement;
        if (target.closest(`[data-menu-root="${openMenuId}"]`)) return;
      }
      setOpenMenuId(null);
    };
    // The menu is positioned in screen coordinates from where the button was
    // when it opened, so any scroll or resize would leave it floating in the
    // wrong place - close it instead.
    const closeOnMove = () => setOpenMenuId(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", closeOnMove);
    window.addEventListener("scroll", closeOnMove, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", closeOnMove);
      window.removeEventListener("scroll", closeOnMove, true);
    };
  }, [openMenuId]);

  // Opens (or closes) a message's menu, placed from the button's real
  // position: right-aligned to the button where there's room, but always
  // clamped inside the screen so it can never be cut off - the old version
  // was anchored to the button's edge, which pushed it off the left side of
  // the screen for messages from other people. Opens upward near the bottom.
  const placeMenu = (id: string, rect: { top: number; bottom: number; right: number }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MENU_WIDTH, vw - MENU_MARGIN * 2);
    const left = Math.max(MENU_MARGIN, Math.min(rect.right - width, vw - width - MENU_MARGIN));
    const roomBelow = vh - rect.bottom - MENU_MARGIN;
    setMenuPos(
      roomBelow >= MENU_EST_HEIGHT || roomBelow >= rect.top
        ? { left, top: rect.bottom + 4 }
        : { left, bottom: vh - rect.top + 4 }
    );
    menuOpenedAtRef.current = Date.now();
    setMenuMore(false);
    setOpenMenuId(id);
  };

  // The ⋮ button: toggles.
  const openMenuFor = (id: string, button: HTMLElement) => {
    if (openMenuId === id) { setOpenMenuId(null); return; }
    placeMenu(id, button.getBoundingClientRect());
  };

  // Press-and-hold / right-click: opens at the finger or cursor.
  const showMenuAt = (id: string, x: number, y: number) => {
    placeMenu(id, { top: y - 8, bottom: y + 10, right: x });
  };

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

    // Respect the pause between messages locally - no point sending one the
    // server is going to refuse. The draft is kept, nothing is lost.
    const waitMs = nextAllowedRef.current - Date.now();
    if (!isAdmin && waitMs > 0) {
      setError(`Doucement ! Patientez ${Math.ceil(waitMs / 1000)} seconde${waitMs > 1000 ? "s" : ""} avant d'envoyer un autre message.`);
      return;
    }
    nextAllowedRef.current = isAdmin ? 0 : Date.now() + cooldownSeconds * 1000;

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
      reactions: [],
      reportCount: 0,
      reportedByMe: false,
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
        // If the poll already delivered this message, dedupe keeps one copy.
        setMessages((prev) => dedupeById(prev.map((m) => (m.clientId === clientId ? data.data : m))));
        latestUpdatedAtRef.current = maxUpdatedAt([data.data], latestUpdatedAtRef.current);
      } else {
        nextAllowedRef.current = 0; // a failed send must not also cost them the wait
        setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
        setError(data?.message || "Échec de l'envoi du message");
      }
    } catch {
      nextAllowedRef.current = 0;
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
        setMessages((prev) => dedupeById(prev.map((x) => (x._id === m._id ? data.data : x))));
        latestUpdatedAtRef.current = maxUpdatedAt([data.data], latestUpdatedAtRef.current);
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

  // Reaction: shown instantly, then confirmed (or undone) by the server.
  const react = async (m: GroupMessage, emoji: string) => {
    if (m.pending || m.failed) return;
    const original = m;
    setMessages((prev) => prev.map((x) => (x._id === m._id ? withToggledReaction(x, emoji) : x)));
    try {
      const res = await fetch(`/api/group-chat/${m._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ react: emoji }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? data.data : x)));
        latestUpdatedAtRef.current = maxUpdatedAt([data.data], latestUpdatedAtRef.current);
      } else {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? original : x)));
        showToast(data?.message || "Réaction impossible");
      }
    } catch {
      setMessages((prev) => prev.map((x) => (x._id === m._id ? original : x)));
      showToast("Erreur réseau");
    }
  };

  const reportMessage = async (m: GroupMessage) => {
    if (!confirm("Signaler ce message aux administrateurs ?")) return;
    try {
      const res = await fetch(`/api/group-chat/${m._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: true }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? data.data : x)));
        showToast("Signalement envoyé — merci 🙏");
      } else {
        showToast(data?.message || "Signalement impossible");
      }
    } catch {
      showToast("Erreur réseau");
    }
  };

  const clearReports = async (m: GroupMessage) => {
    try {
      const res = await fetch(`/api/group-chat/${m._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearReports: true }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessages((prev) => prev.map((x) => (x._id === m._id ? data.data : x)));
        showToast("Signalements effacés");
      }
    } catch { /* leave as-is */ }
  };

  // Who's online: fetched when the sheet opens, then kept fresh while it's open.
  const fetchOnline = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-chat/online?room=${room}`, { credentials: "include" });
      const data = await res.json();
      if (!mountedRef.current || !data?.success) return;
      setOnlineMembers(data.data);
      setOnlineTotal(data.total ?? data.data.length);
    } catch { /* keep the last list */ }
    finally { if (mountedRef.current) setOnlineLoading(false); }
  }, [room]);

  useEffect(() => {
    if (!onlineOpen) return;
    setOnlineLoading(true);
    fetchOnline();
    const id = setInterval(fetchOnline, 8000);
    return () => clearInterval(id);
  }, [onlineOpen, fetchOnline]);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && replyingTo) {
      setReplyingTo(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Touch gestures on a message: swipe to reply, press-and-hold for the menu ──
  // `dir` is the direction the bubble is dragged: your own messages sit on the
  // right so they slide LEFT; everyone else's sit on the left so they slide
  // RIGHT - always into free space, never off the edge of the screen.
  const clearGesture = (animateBack: boolean) => {
    const g = gestureRef.current;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (animateBack) {
      g.el.style.transition = "transform 0.18s ease";
      g.el.style.transform = "";
      g.el.style.setProperty("--p", "0");
    }
    gestureRef.current = null;
  };

  const gestureHandlers = (m: GroupMessage, isOwn: boolean) => {
    if (m.pending || m.failed || editingId === m._id) return {};
    const dir: 1 | -1 = isOwn ? -1 : 1;
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" || !e.isPrimary) return;
        clearGesture(false);
        const el = e.currentTarget;
        el.style.transition = "none";
        const g = {
          id: m._id, startX: e.clientX, startY: e.clientY, dir, el,
          mode: "pending" as const, timer: null as ReturnType<typeof setTimeout> | null, offset: 0,
        };
        const x = e.clientX, y = e.clientY;
        g.timer = setTimeout(() => {
          const cur = gestureRef.current;
          if (!cur || cur !== g || cur.mode !== "pending") return;
          cur.mode = "long";
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 500);
          buzz(15);
          dismissHint();
          showMenuAt(m._id, x, y);
        }, LONG_PRESS_MS);
        gestureRef.current = g;
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gestureRef.current;
        if (!g || g.id !== m._id || g.mode === "cancel" || g.mode === "long") return;
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        if (g.mode === "pending") {
          if (Math.abs(dx) < GESTURE_SLOP && Math.abs(dy) < GESTURE_SLOP) return;
          if (g.timer) { clearTimeout(g.timer); g.timer = null; }
          if (Math.abs(dx) > Math.abs(dy) && Math.sign(dx) === g.dir) {
            g.mode = "swipe";
            try { g.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          } else {
            g.mode = "cancel"; // vertical scroll (or wrong direction) - let the page have it
            return;
          }
        }
        if (g.mode === "swipe") {
          const travelled = Math.max(0, dx * g.dir);
          const eased = Math.min(SWIPE_MAX, travelled * 0.8);
          const offset = eased * g.dir;
          if (eased >= SWIPE_THRESHOLD * 0.8 && Math.abs(g.offset) < SWIPE_THRESHOLD * 0.8) buzz(8); // "armed" tick
          g.offset = offset;
          g.el.style.transform = `translateX(${offset}px)`;
          g.el.style.setProperty("--p", String(Math.min(1, eased / (SWIPE_THRESHOLD * 0.8))));
        }
      },
      onPointerUp: () => {
        const g = gestureRef.current;
        if (!g || g.id !== m._id) return;
        const triggered = g.mode === "swipe" && Math.abs(g.offset) >= SWIPE_THRESHOLD * 0.8;
        if (g.mode === "swipe") {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 300);
        }
        clearGesture(g.mode === "swipe");
        if (triggered) { buzz(12); dismissHint(); startReply(m); }
      },
      onPointerCancel: () => clearGesture(true),
      onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (openMenuId !== m._id) showMenuAt(m._id, e.clientX, e.clientY);
      },
    };
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
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", background: C.dark, fontFamily: "'DM Sans', sans-serif",
      // The room only ever moves up and down: nothing in it may scroll or
      // rubber-band sideways, like a native chat screen.
      overflow: "hidden", touchAction: "pan-y pinch-zoom", overscrollBehavior: "none",
    }}>
      <style>{`
        @keyframes groupChatHighlight { 0%, 100% { background: transparent; } 40% { background: rgba(201,168,76,0.18); } }
        .gc-highlight { animation: groupChatHighlight ${HIGHLIGHT_MS}ms ease; }
        @keyframes gcFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .gc-msg-enter { animation: gcFadeIn 160ms ease; }
        .gc-menu-btn { background: none; border: none; cursor: pointer; color: ${C.muted}; font-size: 16px; line-height: 1; padding: 2px 5px; border-radius: 4px; }
        .gc-menu-btn:hover { background: rgba(255,255,255,0.08); }
        .gc-menu-popover { position: fixed; background: ${C.dark3}; border: 1px solid ${C.border}; border-radius: 10px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.45); z-index: 2100; max-height: calc(100dvh - 16px); overflow-y: auto; }
        .gc-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; background: none; border: none; text-align: left; padding: 8px 10px; font-size: 12px; color: ${C.text}; cursor: pointer; border-radius: 6px; font-family: inherit; }
        .gc-menu-item:hover { background: ${C.dark4}; }
        .gc-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
        .gc-menu-item.danger { color: ${C.red}; }
        .gc-bubble-wrap { -webkit-tap-highlight-color: transparent; }
        .gc-typing { position: absolute; left: 12px; bottom: 8px; max-width: calc(100% - 76px); display: flex; align-items: center; gap: 8px; background: ${C.dark3}; border: 1px solid ${C.border}; color: ${C.muted}; font-size: 11px; font-weight: 600; padding: 5px 11px; border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); pointer-events: none; z-index: 5; }
        .gc-typing-dots { display: inline-flex; gap: 3px; }
        .gc-typing-dots i { width: 4px; height: 4px; border-radius: 50%; background: ${C.gold}; animation: gcTypingBounce 1.1s ease-in-out infinite; }
        .gc-typing-dots i:nth-child(2) { animation-delay: 0.15s; }
        .gc-typing-dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes gcTypingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .gc-typing-dots i { animation: none; opacity: 0.8; } }
        .gc-menu-item svg { flex-shrink: 0; }
        .gc-react-row { display: flex; justify-content: space-between; gap: 2px; padding: 4px 4px 6px; margin-bottom: 4px; border-bottom: 1px solid ${C.border}; }
        .gc-react-btn { flex: 1; background: none; border: none; font-size: 20px; line-height: 1; padding: 6px 0; border-radius: 8px; cursor: pointer; transition: transform 0.12s ease, background 0.12s ease; }
        .gc-react-btn:hover { background: ${C.dark4}; transform: scale(1.15); }
        .gc-react-btn-on { background: rgba(201,168,76,0.18); }
        @media (pointer: coarse) { .gc-bubble-wrap { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; } }
        .gc-swipe-hint { position: absolute; top: 50%; width: 26px; height: 26px; border-radius: 50%; background: ${C.dark4}; border: 1px solid ${C.border}; color: ${C.gold}; display: flex; align-items: center; justify-content: center; font-size: 14px; pointer-events: none; opacity: var(--p, 0); transform: translateY(-50%) scale(calc(0.6 + var(--p, 0) * 0.4)); }
        .gc-fab-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; background: ${C.gold}; color: ${C.dark}; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid ${C.dark}; }
        .gc-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); background: ${C.dark4}; border: 1px solid ${C.border}; color: ${C.text}; font-size: 12px; font-weight: 600; padding: 8px 14px; border-radius: 999px; box-shadow: 0 6px 18px rgba(0,0,0,0.45); animation: gcFadeIn 160ms ease; pointer-events: none; z-index: 30; }
        .gc-fab { position: absolute; right: 16px; bottom: 16px; width: 38px; height: 38px; border-radius: 50%; background: ${C.dark4}; border: 1px solid ${C.border}; color: ${C.gold}; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
        .gc-composer-input { transition: height 0.1s ease; }
        .gc-header-btn { display: flex; align-items: center; justify-content: center; height: 36px; background: ${C.dark4}; border: 1px solid ${C.border}; border-radius: 10px; color: ${C.muted}; cursor: pointer; font-family: inherit; transition: background 0.15s ease, border-color 0.15s ease; }
        .gc-header-btn:hover { background: ${C.border}; }
        /* On narrow phones the star filter collapses to just its icon so the title keeps its room. */
        @media (max-width: 420px) {
          .gc-header-btn-label { display: none; }
          .gc-header-btn:has(.gc-header-btn-label) { width: 36px; padding: 0 !important; }
        }
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.dark3, flexShrink: 0 }}>
        <button onClick={close} aria-label="Retour" title="Retour" className="gc-header-btn" style={{ width: 36, flexShrink: 0, padding: 0 }}>
          <PiArrowLeftBold size={17} />
        </button>

        <div aria-hidden style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
          {icon}
        </div>

        {/* minWidth: 0 is what lets the title/subtitle truncate instead of pushing the buttons off-screen on narrow phones. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 1, lineHeight: 1.15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 11, color: C.muted, minWidth: 0 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{subtitle}</span>
            {onlineCount !== null && onlineCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlineOpen(true)}
                aria-label={`${onlineCount} en ligne - voir qui`}
                title="Voir qui est en ligne"
                style={{ display: "flex", alignItems: "center", gap: 5, color: "#4ADE80", flexShrink: 0, fontWeight: 600, whiteSpace: "nowrap", background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}
              >
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 0 3px rgba(74,222,128,0.18)" }} />
                {onlineCount} en ligne
                <span aria-hidden style={{ opacity: 0.7 }}>›</span>
              </button>
            )}
          </div>
        </div>

        <button
          onClick={() => setFilter((f) => (f === "all" ? "starred" : "all"))}
          aria-label={filter === "starred" ? "Afficher tous les messages" : "Afficher les favoris"}
          aria-pressed={filter === "starred"}
          title={filter === "starred" ? "Afficher tous les messages" : "Afficher les favoris"}
          className="gc-header-btn"
          style={{
            flexShrink: 0, gap: 6, padding: "0 12px", fontSize: 12, fontWeight: 700,
            background: filter === "starred" ? "rgba(201,168,76,0.15)" : undefined,
            borderColor: filter === "starred" ? C.gold : undefined,
            color: filter === "starred" ? C.gold : undefined,
          }}
        >
          <span aria-hidden style={{ display: "flex" }}>{filter === "starred" ? <PiStarFill size={15} /> : <PiStarBold size={15} />}</span>
          <span className="gc-header-btn-label">{filter === "starred" ? "Favoris" : "Tout voir"}</span>
        </button>
      </div>

      {/* Pinned strip */}
      {pinnedMessages.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(201,168,76,0.06)", flexShrink: 0 }}>
          <button
            onClick={() => setPinnedOpen((o) => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", color: C.gold, fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><PiPushPinBold size={13} /> {pinnedMessages.length} message{pinnedMessages.length > 1 ? "s" : ""} épinglé{pinnedMessages.length > 1 ? "s" : ""}</span>
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
          style={{ position: "absolute", inset: 0, overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", touchAction: "pan-y", WebkitOverflowScrolling: "touch", padding: "14px 12px", display: "flex", flexDirection: "column" }}
        >
          {hasMoreOlder && !loadingMessages && filter === "all" && (
            <div ref={topSentinelRef} style={{ display: "flex", justifyContent: "center", padding: "2px 0 12px", flexShrink: 0 }}>
              {loadingOlder ? (
                <InlineLoader size={20} label="Chargement…" padding="2px 0" />
              ) : (
                <button
                  type="button"
                  onClick={loadOlder}
                  style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 999, color: C.muted, fontSize: 11, fontWeight: 700, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  ↑ Messages précédents
                </button>
              )}
            </div>
          )}

          {showHint && !loadingMessages && messages.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 12, padding: "9px 12px", marginBottom: 12, flexShrink: 0 }}>
              <span style={{ color: C.gold, display: "flex", flexShrink: 0 }}><PiLightbulbBold size={18} /></span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.text, lineHeight: 1.45 }}>
                <strong>Astuce :</strong> glissez un message pour y répondre, ou maintenez-le appuyé pour réagir, copier ou signaler.
              </div>
              <button type="button" onClick={dismissHint} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                OK
              </button>
            </div>
          )}

          {loadingMessages ? (
            <div style={{ margin: "auto" }}><InlineLoader size={32} label="Chargement des messages…" padding="0" /></div>
          ) : visibleMessages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 13, padding: "0 20px" }}>
              {filter === "starred"
                ? "Aucun message favori pour l'instant"
                : room === "premium" ? "Soyez le premier à écrire dans le groupe premium 👋" : "Soyez le premier à écrire dans le chat global 👋"}
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
                  {(groupStart || m.pinned || isStarred || (isAdmin && m.senderBlocked && !isOwn) || (isAdmin && m.reportCount > 0)) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, marginBottom: 3, color: isOwn ? "rgba(10,12,15,0.65)" : accent! }}>
                      {groupStart && m.role === "ADMIN" && !isOwn && <span>👑</span>}
                      {groupStart && <span>{senderLabel(m, user._id)}</span>}
                      {m.pinned && <span title="Épinglé" style={{ display: "inline-flex" }}><PiPushPinBold size={11} /></span>}
                      {isStarred && <span title="Favori" style={{ display: "inline-flex" }}><PiStarFill size={11} /></span>}
                      {/* Visible to admins only — a muted account isn't publicly labeled to the rest of the room. */}
                      {isAdmin && m.reportCount > 0 && (
                        <span title={`Signalé par ${m.reportCount} membre${m.reportCount > 1 ? "s" : ""}`} style={{ color: C.red, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><PiFlagBold size={11} /> {m.reportCount}</span>
                      )}
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
                          onClick={() => { if (!suppressClickRef.current) setLightboxImage(m.image); }}
                          style={{ display: "block", maxWidth: "100%", maxHeight: 260, borderRadius: 8, marginBottom: m.text ? 6 : 2, cursor: "zoom-in" }}
                        />
                      )}
                      {m.text && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}><Linkified text={m.text} /></div>}

                      {m.reactions.length > 0 && !m.pending && !m.failed && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {m.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); react(m, r.emoji); }}
                              aria-label={`${r.emoji} ${r.count}${r.mine ? " (vous)" : ""}`}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "inherit",
                                background: r.mine ? (isOwn ? "rgba(10,12,15,0.22)" : "rgba(201,168,76,0.18)") : (isOwn ? "rgba(10,12,15,0.1)" : "rgba(255,255,255,0.06)"),
                                border: `1px solid ${r.mine ? (isOwn ? "rgba(10,12,15,0.5)" : C.gold) : (isOwn ? "rgba(10,12,15,0.18)" : C.border)}`,
                                color: "inherit", borderRadius: 999, padding: "0 7px", fontSize: 11.5, cursor: "pointer", lineHeight: 1.55,
                              }}
                            >
                              <span>{r.emoji}</span><span style={{ fontSize: 10.5, fontWeight: 700 }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

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
                            <IconBtn title="Répondre" onClick={() => startReply(m)} dim={isOwn}><PiArrowBendUpLeftBold size={13} /></IconBtn>
                            <div style={{ position: "relative" }} data-menu-root={m._id}>
                              <button
                                type="button" className="gc-menu-btn" aria-label="Plus d'options" title="Plus d'options"
                                onClick={(e) => openMenuFor(m._id, e.currentTarget)}
                                style={{ color: isOwn ? "inherit" : C.muted, opacity: 0.75 }}
                              >
                                <PiDotsThreeVerticalBold size={16} />
                              </button>
                              {openMenuId === m._id && menuPos && createPortal(
                                <div
                                  className="gc-menu-popover"
                                  data-menu-root={m._id}
                                  style={{ left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, width: Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2) }}
                                >
                                  <div className="gc-react-row">
                                    {REACTION_EMOJIS.map((emoji) => {
                                      const mine = m.reactions.some((r) => r.emoji === emoji && r.mine);
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          aria-label={`Réagir ${emoji}`}
                                          className={mine ? "gc-react-btn gc-react-btn-on" : "gc-react-btn"}
                                          onClick={() => { react(m, emoji); setOpenMenuId(null); }}
                                        >
                                          {emoji}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {(() => {
                                    const canReport = !isAdmin && !isOwn && !m.reportedByMe;
                                    const hasMore = canReport || isAdmin; // moderation + report live behind "Plus"
                                    const I = 15;
                                    if (menuMore) {
                                      return (
                                        <>
                                          <button className="gc-menu-item" onClick={() => setMenuMore(false)}>
                                            <PiCaretLeftBold size={I} /><span>Retour</span>
                                          </button>
                                          {canReport && (
                                            <button className="gc-menu-item" onClick={() => { setOpenMenuId(null); reportMessage(m); }}>
                                              <PiFlagBold size={I} /><span>Signaler ce message</span>
                                            </button>
                                          )}
                                          {isAdmin && m.reportCount > 0 && (
                                            <button className="gc-menu-item" onClick={() => { setOpenMenuId(null); clearReports(m); }}>
                                              <PiCheckCircleBold size={I} /><span>Effacer les signalements ({m.reportCount})</span>
                                            </button>
                                          )}
                                          {isAdmin && (
                                            <button className="gc-menu-item" disabled={isBusy} onClick={() => { togglePin(m); setOpenMenuId(null); }}>
                                              {m.pinned ? <PiPushPinSlashBold size={I} /> : <PiPushPinBold size={I} />}<span>{m.pinned ? "Désépingler" : "Épingler"}</span>
                                            </button>
                                          )}
                                          {isAdmin && !isOwn && (
                                            <button className="gc-menu-item danger" disabled={blockBusyUserId === m.user} onClick={() => { toggleBlock(m); setOpenMenuId(null); }}>
                                              <PiProhibitBold size={I} /><span>{m.senderBlocked ? "Débloquer" : "Bloquer cet utilisateur"}</span>
                                            </button>
                                          )}
                                          {isAdmin && !isOwn && (
                                            <button className="gc-menu-item danger" disabled={isBusy} onClick={() => { setOpenMenuId(null); deleteMessage(m._id); }}>
                                              <PiTrashBold size={I} /><span>Supprimer (modération)</span>
                                            </button>
                                          )}
                                        </>
                                      );
                                    }
                                    return (
                                      <>
                                        <button className="gc-menu-item" onClick={() => { startReply(m); setOpenMenuId(null); }}>
                                          <PiArrowBendUpLeftBold size={I} /><span>Répondre</span>
                                        </button>
                                        {m.text && (
                                          <button className="gc-menu-item" onClick={async () => { setOpenMenuId(null); showToast((await copyText(m.text)) ? "Message copié ✓" : "Copie impossible"); }}>
                                            <PiCopyBold size={I} /><span>Copier le texte</span>
                                          </button>
                                        )}
                                        <button className="gc-menu-item" onClick={() => { toggleStar(m._id); setOpenMenuId(null); }}>
                                          {isStarred ? <PiStarFill size={I} /> : <PiStarBold size={I} />}<span>{isStarred ? "Retirer des favoris" : "Ajouter aux favoris"}</span>
                                        </button>
                                        {isOwn && (
                                          <button className="gc-menu-item" disabled={isBusy} onClick={() => { startEdit(m); setOpenMenuId(null); }}>
                                            <PiPencilSimpleBold size={I} /><span>Modifier</span>
                                          </button>
                                        )}
                                        {isOwn && (
                                          <button className="gc-menu-item danger" disabled={isBusy} onClick={() => { setOpenMenuId(null); deleteMessage(m._id); }}>
                                            <PiTrashBold size={I} /><span>Supprimer</span>
                                          </button>
                                        )}
                                        {hasMore && (
                                          <button className="gc-menu-item" onClick={() => setMenuMore(true)}>
                                            <PiDotsThreeBold size={I} /><span>Plus</span>
                                            <PiCaretRightBold size={12} style={{ marginLeft: "auto", opacity: 0.6 }} />
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>,
                                document.body
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
                      <div style={{ width: 28, flexShrink: 0, alignSelf: "flex-end" }}>
                        {groupEnd && <Avatar label={initialsFor(m)} color={accent ?? C.muted} src={avatars[m.user]} />}
                      </div>
                    )}
                    <div
                      className="gc-bubble-wrap"
                      {...gestureHandlers(m, isOwn)}
                      style={{ maxWidth: "min(80%, 480px)", minWidth: 0, position: "relative", touchAction: "pan-y" }}
                    >
                      <span aria-hidden className="gc-swipe-hint" style={isOwn ? { right: -30 } : { left: -30 }}><PiArrowBendUpLeftBold size={14} /></span>
                      {bubble}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!atBottom && !loadingMessages && (
          <button className="gc-fab" onClick={jumpToBottom} aria-label={unseenBelow > 0 ? `${unseenBelow} nouveaux messages - aller en bas` : "Aller aux derniers messages"} title="Aller aux derniers messages">
            <PiArrowDownBold size={16} />
            {unseenBelow > 0 && <span className="gc-fab-badge">{unseenBelow > 9 ? "9+" : unseenBelow}</span>}
          </button>
        )}

        {toast && <div role="status" className="gc-toast">{toast}</div>}

        {typingNames.length > 0 && (
          <div className="gc-typing" aria-live="polite">
            <span className="gc-typing-dots" aria-hidden><i /><i /><i /></span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {typingNames.length === 1
                ? `${typingNames[0]} écrit…`
                : typingNames.length === 2
                  ? `${typingNames[0]} et ${typingNames[1]} écrivent…`
                  : `${typingNames.length} personnes écrivent…`}
            </span>
          </div>
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
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="Annuler la réponse" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex", flexShrink: 0 }}><PiXBold size={14} /></button>
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
            {compressing ? "…" : <PiPaperclipBold size={17} />}
          </button>
          <textarea
            ref={textareaRef}
            className="gc-composer-input gc-scroll"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
              // Let the room know someone is typing (throttled; best-effort).
              if (e.target.value.trim() && Date.now() - lastTypingPingRef.current > 2500) {
                lastTypingPingRef.current = Date.now();
                fetch("/api/group-chat/typing", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ room }),
                }).catch(() => { /* a missed ping just means a slightly late indicator */ });
              }
            }}
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
            <PiPaperPlaneRightFill size={16} />
          </button>
        </div>
      </form>
      )}

      {/* Who's online */}
      {onlineOpen && (
        <div
          onClick={() => setOnlineOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, maxHeight: "70dvh", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text }}>
                En ligne <span style={{ color: "#4ADE80" }}>({onlineTotal})</span>
              </div>
              <button onClick={() => setOnlineOpen(false)} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}><PiXBold size={14} /></button>
            </div>
            <div className="gc-scroll" style={{ overflowY: "auto", padding: "6px 8px 12px" }}>
              {onlineLoading && onlineMembers.length === 0 ? (
                <div style={{ padding: 20 }}><InlineLoader size={24} label="Chargement…" padding="0" /></div>
              ) : onlineMembers.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>Personne en ligne pour l&apos;instant.</div>
              ) : (
                onlineMembers.map((mb) => (
                  <div key={mb.user} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10 }}>
                    <Avatar
                      label={mb.role === "ADMIN" ? "👑" : mb.label.slice(0, 2)}
                      color={mb.role === "ADMIN" ? C.gold : colorForUser(mb.user)}
                      src={mb.isMe ? user?.avatar : avatars[mb.user]}
                    />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mb.isMe ? "Vous" : mb.label}
                    </div>
                    {mb.role === "ADMIN" && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: C.gold, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" }}>Admin</span>
                    )}
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", flexShrink: 0 }} />
                  </div>
                ))
              )}
              {onlineTotal > onlineMembers.length && (
                <div style={{ padding: "8px 10px", fontSize: 11, color: C.muted, textAlign: "center" }}>
                  + {onlineTotal - onlineMembers.length} autre{onlineTotal - onlineMembers.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>
        </div>
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

function Avatar({ label, color, src }: { label: string; color: string; src?: string | null }) {
  return (
    <div
      style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
        background: `${color}26`, border: `1.5px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image can't optimize it anyway
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        label
      )}
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
          <button onClick={onClose} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}><PiXBold size={14} /></button>
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
