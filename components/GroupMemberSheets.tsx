"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PiXBold, PiCaretRightBold, PiFireFill, PiLockSimpleFill, PiShieldCheckFill } from "react-icons/pi";
import { InlineLoader } from "@/components/LoadingSpinner";
import type { GroupRoom } from "@/models/GroupMessage";

// The two bottom sheets opened from the group chat: the MEMBERS list and a
// single member's PROFILE card. Everything shown here is deliberately limited
// (masked names only, no money, no live coupons) - see
// app/api/group-chat/members/[userId]/route.ts for the rules.

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0",
  gold: "#C9A84C", red: "#EF4444", green: "#22C55E", blue: "#3B82F6", online: "#4ADE80",
};

const USER_COLORS = ["#5B9BD5", "#4CC9F0", "#43AA8B", "#8AC926", "#F3722C", "#EF476F", "#9B5DE5", "#F15BB5", "#70C1B3"];
function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function Face({ label, role, userId, src, size }: { label: string; role: "USER" | "ADMIN"; userId: string; src?: string | null; size: number }) {
  const color = role === "ADMIN" ? C.gold : colorFor(userId);
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
        background: `${color}26`, border: `1.5px solid ${color}`, color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.36), fontWeight: 700,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image can't optimize it anyway
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : role === "ADMIN" ? (
        "👑"
      ) : (
        label.slice(0, 2)
      )}
    </div>
  );
}

// Coarse on purpose ("Vu hier", not a clock time) - enough to tell active from
// gone without logging anyone's exact movements.
function seenLabel(online: boolean, lastSeenAt: string): string {
  if (online) return "En ligne";
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60_000);
  if (mins < 60) return `Vu il y a ${Math.max(1, mins)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours < 6 ? `Vu il y a ${hours} h` : "Vu aujourd'hui";
  const days = Math.floor(hours / 24);
  if (days === 1) return "Vu hier";
  if (days < 60) return `Vu il y a ${days} j`;
  return "Inactif";
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2200,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const sheetStyle: React.CSSProperties = {
  background: C.dark2, border: `1px solid ${C.border}`, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480,
  maxHeight: "82dvh", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)",
  overscrollBehavior: "contain",
};

function SheetHeader({ title, sub, onClose }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      <button onClick={onClose} aria-label="Fermer" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PiXBold size={14} />
      </button>
    </div>
  );
}

// ─── Members list ───────────────────────────────────────────────────────────
interface Member {
  user: string;
  role: "USER" | "ADMIN";
  label: string;
  online: boolean;
  lastSeenAt: string;
  isMe: boolean;
}

export function MembersSheet({
  room, hideCounts, onlineCount, avatars, ensureAvatars, onOpenProfile, onClose,
}: {
  room: GroupRoom;
  /** Premium + not an admin: no numbers anywhere, and no way to page through everyone. */
  hideCounts: boolean;
  onlineCount: number | null;
  avatars: Record<string, string | null>;
  ensureAvatars: (ids: string[]) => void;
  onOpenProfile: (userId: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null) => {
    try {
      if (cursor) setLoadingMore(true); else setLoading(true);
      setError(null);
      const params = new URLSearchParams({ room });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/group-chat/members?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.message || "Impossible de charger les membres");
      const page: Member[] = data.data;
      setMembers((prev) => {
        if (!cursor) return page;
        const known = new Set(prev.map((m) => m.user));
        return [...prev, ...page.filter((m) => !known.has(m.user))];
      });
      setNextCursor(data.nextCursor ?? null);
      ensureAvatars(page.map((m) => m.user));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [room, ensureAvatars]);

  useEffect(() => { load(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [room]);

  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);

  const Row = ({ m }: { m: Member }) => (
    <button
      type="button"
      onClick={() => onOpenProfile(m.user)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 12, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Face label={m.label} role={m.role} userId={m.user} src={avatars[m.user]} size={38} />
        {m.online && <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: C.online, border: `2px solid ${C.dark2}` }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.isMe ? "Vous" : m.label}
          </span>
          {m.role === "ADMIN" && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: C.gold, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", flexShrink: 0 }}>Équipe</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: m.online ? C.online : C.muted, marginTop: 1 }}>{seenLabel(m.online, m.lastSeenAt)}</div>
      </div>
      <PiCaretRightBold size={14} color={C.muted} style={{ flexShrink: 0 }} />
    </button>
  );

  const sectionLabel = (text: string, count?: number) => (
    <div style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted, fontWeight: 700, padding: "10px 10px 4px" }}>
      {text}{count !== undefined ? ` · ${count}` : ""}
    </div>
  );

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <SheetHeader
          title="Membres"
          sub={!hideCounts && onlineCount !== null ? <span style={{ color: C.online }}>{onlineCount} en ligne</span> : undefined}
          onClose={onClose}
        />
        <div style={{ overflowY: "auto", padding: "4px 8px 14px" }}>
          {loading ? (
            <div style={{ padding: 24 }}><InlineLoader size={24} label="Chargement…" padding="0" /></div>
          ) : error ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.red }}>{error}</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun membre pour l&apos;instant.</div>
          ) : (
            <>
              {online.length > 0 && (
                <>
                  {sectionLabel("En ligne", hideCounts ? undefined : online.length)}
                  {online.map((m) => <Row key={m.user} m={m} />)}
                </>
              )}
              {offline.length > 0 && (
                <>
                  {sectionLabel("Hors ligne", hideCounts ? undefined : offline.length)}
                  {offline.map((m) => <Row key={m.user} m={m} />)}
                </>
              )}
              {nextCursor && (
                <div style={{ textAlign: "center", paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => load(nextCursor)}
                    disabled={loadingMore}
                    style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 999, color: C.muted, fontSize: 11, fontWeight: 700, padding: "7px 16px", cursor: loadingMore ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {loadingMore ? "Chargement…" : "Voir plus"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── One member's profile card ──────────────────────────────────────────────
interface MemberProfile {
  user: string;
  role: "USER" | "ADMIN";
  label: string;
  avatar: string | null;
  online: boolean;
  lastSeenAt: string;
  memberSince: string;
  isMe: boolean;
  isStaff: boolean;
  isPrivate: boolean;
  hiddenFromMembers?: boolean;
  loyalty: "Nouveau" | "Régulier" | "Fidèle" | "VIP" | null;
  stats: { played: number; wins: number; losses: number; refunds: number; winRate: number | null; streak: number } | null;
  history: { _id: string; title: string; tier: "safe" | "value" | "bold" | null; totalOdds: number; matchDate: string; outcome: "WIN" | "LOSS" | "REFUNDED" }[];
}

const LOYALTY_COLOR: Record<string, string> = { Nouveau: C.muted, "Régulier": C.blue, "Fidèle": C.green, VIP: C.gold };
const OUTCOME: Record<"WIN" | "LOSS" | "REFUNDED", { label: string; color: string }> = {
  WIN: { label: "Gagné", color: C.green },
  LOSS: { label: "Perdu", color: C.red },
  REFUNDED: { label: "Remboursé", color: C.blue },
};
const TIER_LABEL: Record<string, string> = { safe: "Safe", value: "Value", bold: "Bold" };

export function MemberProfileSheet({ room, userId, fallbackAvatar, onClose }: {
  room: GroupRoom;
  userId: string;
  /** Picture already known to the chat, shown while the card loads. */
  fallbackAvatar?: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/group-chat/members/${userId}?room=${room}`, { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.success) setProfile(data.data);
        else setError(data?.message || "Profil indisponible");
      } catch {
        if (!cancelled) setError("Erreur réseau");
      }
    })();
    return () => { cancelled = true; };
  }, [room, userId]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const since = profile ? new Date(profile.memberSince).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";

  return (
    <div onClick={onClose} style={{ ...overlayStyle, zIndex: 2300 }}>
      <div onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <SheetHeader title="Profil" onClose={onClose} />
        <div style={{ overflowY: "auto", padding: "18px 16px 20px" }}>
          {error ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: C.red }}>{error}</div>
          ) : !profile ? (
            <div style={{ padding: 20 }}><InlineLoader size={24} label="Chargement…" padding="0" /></div>
          ) : (
            <>
              {/* Identity */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 18 }}>
                <Face label={profile.label} role={profile.role} userId={profile.user} src={profile.avatar ?? fallbackAvatar} size={84} />
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 10 }}>{profile.isMe ? "Vous" : profile.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: profile.online ? C.online : C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {profile.online && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: C.online }} />}
                    {seenLabel(profile.online, profile.lastSeenAt)}
                  </span>
                  {profile.isStaff && (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: C.gold, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <PiShieldCheckFill size={11} /> Équipe
                    </span>
                  )}
                  {profile.loyalty && (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: LOYALTY_COLOR[profile.loyalty], background: `${LOYALTY_COLOR[profile.loyalty]}1F`, border: `1px solid ${LOYALTY_COLOR[profile.loyalty]}40`, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase" }}>
                      {profile.loyalty}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Membre depuis {since}</div>
              </div>

              {profile.isStaff ? (
                <div style={{ textAlign: "center", fontSize: 13, color: C.muted, lineHeight: 1.6, background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  Membre de l&apos;équipe — il anime et modère le groupe.
                </div>
              ) : profile.isPrivate ? (
                <div style={{ textAlign: "center", fontSize: 13, color: C.muted, lineHeight: 1.6, background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  <PiLockSimpleFill size={18} color={C.muted} style={{ marginBottom: 6 }} />
                  <div>Ce membre a choisi de garder ses statistiques privées.</div>
                </div>
              ) : profile.stats && (
                <>
                  {profile.hiddenFromMembers && (
                    <div style={{ fontSize: 11, color: C.gold, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 10, padding: "7px 10px", marginBottom: 12, textAlign: "center" }}>
                      Profil masqué pour les membres — visible ici car vous êtes admin.
                    </div>
                  )}

                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Joués", value: profile.stats.played, color: C.text },
                      { label: "Gagnés", value: profile.stats.wins, color: C.green },
                      { label: "Perdus", value: profile.stats.losses, color: C.red },
                      { label: "Taux", value: profile.stats.winRate !== null ? `${profile.stats.winRate}%` : "—", color: C.gold },
                    ].map((t) => (
                      <div key={t.label} style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 4px", textAlign: "center", minWidth: 0 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, lineHeight: 1, color: t.color }}>{t.value}</div>
                        <div style={{ fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", color: C.muted, marginTop: 4 }}>{t.label}</div>
                      </div>
                    ))}
                  </div>
                  {profile.stats.streak >= 2 && (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.gold, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 999, padding: "5px 12px" }}>
                        <PiFireFill size={13} /> {profile.stats.streak} d&apos;affilée
                      </span>
                    </div>
                  )}

                  {/* History */}
                  <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: C.muted, fontWeight: 700, margin: "6px 2px 8px" }}>
                    Derniers coupons
                  </div>
                  {profile.history.length === 0 ? (
                    <div style={{ textAlign: "center", fontSize: 12.5, color: C.muted, padding: "14px 0" }}>Aucun coupon terminé pour l&apos;instant.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {profile.history.map((h) => {
                        const o = OUTCOME[h.outcome];
                        return (
                          <div key={h._id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.dark3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${o.color}`, borderRadius: 10, padding: "9px 11px" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {h.title}
                              </div>
                              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {h.tier && <span style={{ color: C.gold, fontWeight: 700 }}>{TIER_LABEL[h.tier]}</span>}
                                <span>x{h.totalOdds}</span>
                                <span>{fmtDate(h.matchDate)}</span>
                              </div>
                            </div>
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: o.color, background: `${o.color}1F`, border: `1px solid ${o.color}40`, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {o.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {profile.isMe && (
                <div style={{ marginTop: 16, fontSize: 11.5, color: C.muted, lineHeight: 1.55, textAlign: "center" }}>
                  C&apos;est ce que les autres membres voient. Vous pouvez le masquer dans{" "}
                  <Link href="/profil" style={{ color: C.gold, fontWeight: 700 }}>Profil › Mes stats dans les groupes</Link>.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
