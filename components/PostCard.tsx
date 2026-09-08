"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PiHeart, PiHeartFill, PiChatCircle,
  PiPaperPlaneTiltBold, PiTrashBold, PiPaperPlaneRightBold, PiCheckCircleFill,
  PiChartBarFill,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";

export interface ClientPostComment {
  _id: string;
  user: string;
  phone: string;
  role: "USER" | "ADMIN";
  text: string;
  createdAt: string;
  isMine: boolean;
}

export interface ClientPostPoll {
  optionALabel: string;
  optionBLabel: string;
  counts: { a: number; b: number };
  total: number;
  myVote: "A" | "B" | null;
}

export interface ClientPost {
  _id: string;
  authorName: string;
  text: string;
  image: string | null;
  poll: ClientPostPoll | null;
  likeCount: number;
  likedByMe: boolean;
  shareCount: number;
  comments: ClientPostComment[];
  createdAt: string;
}

// First letter of up to the first two words — "Coupon Sûr" -> "CS", a
// single-word name like "Admin" -> "A". Same idea as the avatar-initials
// pattern most social apps use for a name that isn't "Coupon Sûr" every time.
function initialsFor(name: string): string {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "•";
}

// Caption length beyond which it collapses behind "plus" — long enough
// that most posts show in full, short enough that a long one doesn't
// dominate the whole feed before someone's chosen to read it.
const CAPTION_TRUNCATE_AT = 180;

// Renders a caption exactly as typed — line breaks and spacing preserved
// (`white-space: pre-wrap`, the actual fix for admin formatting getting
// silently collapsed by default HTML whitespace rules) — collapsing it
// behind "…plus" past CAPTION_TRUNCATE_AT characters, Instagram-caption
// style, rather than dumping a wall of text into the feed. No author name
// prefix here — that already lives in the header row above the media, so
// repeating it here would just be noise.
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > CAPTION_TRUNCATE_AT;
  const shown = expanded || !isLong ? text : text.slice(0, CAPTION_TRUNCATE_AT).trimEnd();

  return (
    <div style={{ fontSize: 13.5, color: "#F5F5F5", lineHeight: 1.45, marginBottom: 4, whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
      {shown}
      {isLong && !expanded && (
        <>
          {"… "}
          <button onClick={() => setExpanded(true)} style={readMoreBtnStyle}>plus</button>
        </>
      )}
      {isLong && expanded && (
        <>
          {" "}
          <button onClick={() => setExpanded(false)} style={readMoreBtnStyle}>moins</button>
        </>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// One post in the Actus feed — borderless, divider-separated, full-bleed
// media: the same visual language as a modern Instagram feed rather than a
// bordered "card" (avatar + bold name header, a square edge-to-edge photo,
// icon-only action row, bold like count, caption, collapsed "view
// comments" link, small caps timestamp last). Posting is admin-only —
// everything interactive here is a buyer action.
export function PostCard({ post, onUpdate }: { post: ClientPost; onUpdate: (p: ClientPost) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [liking, setLiking] = useState(false);
  const [voting, setVoting] = useState<"A" | "B" | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [heartPop, setHeartPop] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  // Opening the comments (via the icon, or the "voir les commentaires"
  // link) can land the composer well below the fold once there's a list of
  // comments above it — scroll it into view so tapping the icon always
  // lands you somewhere you can actually type, not just a longer list.
  useEffect(() => {
    if (commentsOpen) composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [commentsOpen]);

  const requireLogin = () => router.push("/profil");

  const popHeart = () => {
    setHeartPop(true);
    setTimeout(() => setHeartPop(false), 700);
  };

  const toggleLike = async () => {
    if (!user) return requireLogin();
    if (liking) return;
    setLiking(true);
    try {
      const res = await fetch(`/api/posts/${post._id}/like`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data?.success) {
        if (!post.likedByMe && data.data.likedByMe) popHeart();
        onUpdate(data.data);
      }
    } catch { /* silent — the next tap tries again */ }
    finally { setLiking(false); }
  };

  // Classic Instagram gesture — double-tapping the photo always likes
  // (never unlikes), with the big heart overlay regardless of whether it
  // was already liked, matching how IG's own double-tap behaves.
  const handleImageDoubleClick = () => {
    popHeart();
    if (!post.likedByMe) toggleLike();
  };

  const vote = async (option: "A" | "B") => {
    if (!user) return requireLogin();
    if (voting || post.poll?.myVote) return;
    setVoting(option);
    try {
      const res = await fetch(`/api/posts/${post._id}/vote`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option }),
      });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* silent */ }
    finally { setVoting(null); }
  };

  const sendComment = async () => {
    if (!user) return requireLogin();
    const text = commentDraft.trim();
    if (!text || commentSending) return;
    setCommentSending(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/posts/${post._id}/comments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.success) { onUpdate(data.data); setCommentDraft(""); }
      else setCommentError(data?.message || "Échec de l'envoi");
    } catch {
      setCommentError("Erreur réseau");
    } finally {
      setCommentSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      const res = await fetch(`/api/posts/${post._id}/comments/${commentId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* comment just stays if the request failed */ }
    finally { setDeletingCommentId(null); }
  };

  const share = async () => {
    if (!user) return requireLogin();
    const url = `${window.location.origin}/actus`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.authorName, text: post.text || `Actu ${post.authorName}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback("Lien copié !");
        setTimeout(() => setShareFeedback(null), 2000);
      }
      const res = await fetch(`/api/posts/${post._id}/share`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch {
      // Share sheet cancelled, clipboard denied, etc. — not worth an error.
    }
  };

  return (
    <article style={articleStyle}>
      <div style={headerStyle}>
        <div style={avatarStyle}>{initialsFor(post.authorName)}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#F5F5F5" }}>{post.authorName}</div>
      </div>

      {post.image && (
        <div style={mediaWrapStyle} onDoubleClick={handleImageDoubleClick}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image} alt="" style={mediaImgStyle} draggable={false} />
          {heartPop && (
            <span style={heartOverlayStyle}>
              <PiHeartFill size={84} color="#fff" style={{ filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.35))" }} />
            </span>
          )}
        </div>
      )}

      {post.poll && (
        <div style={{ padding: post.image ? "12px 16px 0" : "0 16px" }}>
          <PollBlock poll={post.poll} voting={voting} onVote={vote} />
        </div>
      )}

      <div style={bodyPadStyle}>
        <div style={actionRowStyle}>
          <button onClick={toggleLike} disabled={liking} style={iconBtnStyle} aria-label="J'aime">
            {post.likedByMe ? <PiHeartFill size={25} color="#ED4956" /> : <PiHeart size={25} color="#F5F5F5" />}
          </button>
          <button onClick={() => setCommentsOpen((v) => !v)} style={iconBtnStyle} aria-label="Commenter">
            <PiChatCircle size={24} color="#F5F5F5" />
          </button>
          <button onClick={share} style={iconBtnStyle} aria-label="Partager">
            <PiPaperPlaneTiltBold size={22} color="#F5F5F5" />
          </button>
          {shareFeedback && <span style={{ fontSize: 11, color: "#22C55E", marginLeft: 4 }}>{shareFeedback}</span>}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F5", marginBottom: 4 }}>
          {post.likeCount > 0 ? `${post.likeCount} j'aime${post.likeCount > 1 ? "" : ""}` : "Soyez le premier à aimer"}
        </div>

        {post.text && <ExpandableText text={post.text} />}

        {post.comments.length > 0 && !commentsOpen && (
          <button onClick={() => setCommentsOpen(true)} style={viewCommentsBtnStyle}>
            Voir les {post.comments.length} commentaire{post.comments.length > 1 ? "s" : ""}
          </button>
        )}

        {commentsOpen && (
          <div style={commentsWrapStyle}>
            {post.comments.map((c) => (
              <div key={c._id} style={commentRowStyle}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#F5F5F5", lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: c.role === "ADMIN" ? "#C9A84C" : "#F5F5F5" }}>
                    {c.role === "ADMIN" ? "Admin" : c.phone}
                  </span>{" "}
                  {c.text}
                </div>
                {(c.isMine || user?.role === "ADMIN") && (
                  <button
                    onClick={() => deleteComment(c._id)}
                    disabled={deletingCommentId === c._id}
                    style={commentDeleteBtnStyle}
                    aria-label="Supprimer"
                  >
                    <PiTrashBold size={12} />
                  </button>
                )}
              </div>
            ))}

            <div ref={composerRef}>
              {user ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    value={commentDraft}
                    onChange={(e) => { setCommentDraft(e.target.value); setCommentError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }}
                    placeholder="Ajouter un commentaire…"
                    disabled={commentSending}
                    style={commentInputStyle}
                    autoFocus
                  />
                  <button onClick={sendComment} disabled={commentSending || !commentDraft.trim()} style={commentSendBtnStyle}>
                    <PiPaperPlaneRightBold size={14} />
                  </button>
                </div>
              ) : (
                <Link href="/profil" style={{ fontSize: 12, color: "#C9A84C", marginTop: 8, display: "block" }}>
                  Connectez-vous pour commenter
                </Link>
              )}
              {commentError && <div style={{ fontSize: 11, color: "#ED4956", marginTop: 6 }}>{commentError}</div>}
            </div>
          </div>
        )}

        <div style={timestampStyle}>{timeAgo(post.createdAt)}</div>
      </div>
    </article>
  );
}

// The poll used to be just two plain buttons — no label, no verb, nothing
// telling a viewer this was interactive or what tapping it would do. This
// version names itself ("SONDAGE"), states the question, and only after
// that shows the two things to tap — same reason a real ballot has a
// question printed above the checkboxes instead of just two blank boxes.
function PollBlock({ poll, voting, onVote }: { poll: ClientPostPoll; voting: "A" | "B" | null; onVote: (o: "A" | "B") => void }) {
  const hasVoted = poll.myVote !== null;
  const pctA = poll.total > 0 ? Math.round((poll.counts.a / poll.total) * 100) : 0;
  const pctB = poll.total > 0 ? 100 - pctA : 0;

  return (
    <div style={pollWrapStyle}>
      <div style={pollLabelStyle}>
        <PiChartBarFill size={12} /> SONDAGE
      </div>
      <div style={pollPromptStyle}>Qui va gagner ce match ?</div>

      {!hasVoted ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => onVote("A")} disabled={voting !== null} style={pollButtonStyle}>
              {voting === "A" ? "Vote en cours…" : poll.optionALabel}
            </button>
            <div style={vsRowStyle}>
              <span style={vsLineStyle} />
              <span style={vsTextStyle}>VS</span>
              <span style={vsLineStyle} />
            </div>
            <button onClick={() => onVote("B")} disabled={voting !== null} style={pollButtonStyle}>
              {voting === "B" ? "Vote en cours…" : poll.optionBLabel}
            </button>
          </div>
          <div style={pollHintStyle}>Touchez une équipe pour voter et voir les résultats</div>
        </>
      ) : (
        <>
          <PollBar label={poll.optionALabel} pct={pctA} mine={poll.myVote === "A"} />
          <PollBar label={poll.optionBLabel} pct={pctB} mine={poll.myVote === "B"} />
          <div style={{ fontSize: 11, color: "#8E8E8E", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <PiCheckCircleFill size={12} color="#C9A84C" />
            Vous avez voté · {poll.total} vote{poll.total > 1 ? "s" : ""} au total
          </div>
        </>
      )}
    </div>
  );
}

function PollBar({ label, pct, mine }: { label: string; pct: number; mine: boolean }) {
  return (
    <div style={{ position: "relative", marginBottom: 6, borderRadius: 999, overflow: "hidden", background: "#1A1A1A", border: `1px solid ${mine ? "#C9A84C" : "#2A2A2A"}` }}>
      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg, rgba(201,168,76,0.3), rgba(201,168,76,0.15))", transition: "width 0.6s cubic-bezier(0.32,0.72,0,1)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
        <span style={{ fontSize: 12.5, color: "#F5F5F5", fontWeight: mine ? 700 : 500, display: "flex", alignItems: "center", gap: 5 }}>
          {mine && <PiCheckCircleFill size={13} color="#C9A84C" />} {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#C9A84C" }}>{pct}%</span>
      </div>
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */
// Borderless, hairline-divided sections — closer to a modern feed than a
// bordered "card" list. Near-black/white-on-black palette (not this app's
// usual #111418 panels) is deliberate here, matching the reference brief.

const articleStyle: React.CSSProperties = {
  borderBottom: "1px solid #1F1F1F",
  paddingBottom: 14,
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px",
};

const avatarStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
  background: "linear-gradient(135deg, #E8C97A, #C9A84C)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#0A0C0F", fontSize: 12, fontWeight: 700,
};

// A fixed 1:1 square, cropped to fill — every post's media occupies the
// exact same footprint in the feed regardless of the source photo's own
// aspect ratio, the same consistency Instagram's grid/feed enforces
// instead of letting post heights jump around per-image.
const mediaWrapStyle: React.CSSProperties = {
  position: "relative", background: "#000", aspectRatio: "1 / 1", overflow: "hidden",
};

const mediaImgStyle: React.CSSProperties = {
  width: "100%", height: "100%", objectFit: "cover", display: "block",
};

const heartOverlayStyle: React.CSSProperties = {
  position: "absolute", top: "50%", left: "50%",
  transform: "translate(-50%, -50%)",
  animation: "heartPop 0.7s ease-out",
  pointerEvents: "none",
};

const bodyPadStyle: React.CSSProperties = {
  padding: "10px 16px 0",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4, marginLeft: -8, marginBottom: 8,
};

const iconBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer", padding: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const viewCommentsBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#8E8E8E", fontSize: 13,
  cursor: "pointer", padding: 0, marginBottom: 4, fontFamily: "inherit", textAlign: "left",
};

const commentsWrapStyle: React.CSSProperties = {
  marginTop: 6, marginBottom: 6,
};

const commentRowStyle: React.CSSProperties = {
  display: "flex", gap: 8, padding: "5px 0",
};

const commentDeleteBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#8E8E8E", cursor: "pointer", padding: 4, flexShrink: 0,
};

const commentInputStyle: React.CSSProperties = {
  flex: 1, background: "transparent", border: "none", borderBottom: "1px solid #2A2A2A",
  padding: "6px 2px", color: "#F5F5F5", fontSize: 13, outline: "none", fontFamily: "inherit",
};

const commentSendBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#C9A84C", border: "none", width: 32, height: 32,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};

const readMoreBtnStyle: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "#8E8E8E",
  fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const timestampStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: "0.4px", textTransform: "uppercase", color: "#5C5C5C", marginTop: 4,
};

const pollButtonStyle: React.CSSProperties = {
  background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 999,
  padding: "12px 16px", color: "#F5F5F5", fontSize: 13.5, fontWeight: 700,
  cursor: "pointer", textAlign: "center", fontFamily: "inherit",
};

const pollWrapStyle: React.CSSProperties = {
  background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.25)",
  borderRadius: 14, padding: 14, marginBottom: 12,
};

const pollLabelStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  fontSize: 10, letterSpacing: "1.5px", fontWeight: 700, color: "#C9A84C", marginBottom: 6,
};

const pollPromptStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#F5F5F5", marginBottom: 12,
};

const vsRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, margin: "-2px 0",
};

const vsLineStyle: React.CSSProperties = {
  flex: 1, height: 1, background: "#2A2A2A",
};

const vsTextStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#5C5C5C", letterSpacing: "0.5px",
};

const pollHintStyle: React.CSSProperties = {
  fontSize: 11, color: "#8E8E8E", marginTop: 10, textAlign: "center",
};
