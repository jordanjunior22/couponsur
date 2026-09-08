"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PiHeart, PiHeartFill, PiChatCircle, PiChatCircleFill,
  PiShareFat, PiTrashBold, PiPaperPlaneRightBold, PiCheckCircleFill,
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
  text: string;
  image: string | null;
  poll: ClientPostPoll | null;
  likeCount: number;
  likedByMe: boolean;
  shareCount: number;
  comments: ClientPostComment[];
  createdAt: string;
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

// One card in the Actus feed: admin-authored text/photo, an optional
// "team vs team" poll, and the like/comment/share row every post gets.
// Posting is admin-only — everything interactive here is a buyer action.
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

  const requireLogin = () => router.push("/profil");

  const toggleLike = async () => {
    if (!user) return requireLogin();
    if (liking) return;
    setLiking(true);
    try {
      const res = await fetch(`/api/posts/${post._id}/like`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* silent — the next tap tries again */ }
    finally { setLiking(false); }
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
        await navigator.share({ title: "Coupon Sûr", text: post.text || "Actu Coupon Sûr", url });
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
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={logoBadgeStyle}>CS</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAF0" }}>Coupon Sûr</div>
          <div style={{ fontSize: 10.5, color: "#7A8399" }}>{timeAgo(post.createdAt)}</div>
        </div>
      </div>

      {post.text && (
        <div style={{ fontSize: 13, color: "#E8EAF0", lineHeight: 1.5, marginBottom: post.image || post.poll ? 12 : 4 }}>
          {post.text}
        </div>
      )}

      {post.image && (
        <div style={imageWrapStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image} alt="" style={{ width: "100%", display: "block" }} />
        </div>
      )}

      {post.poll && <PollBlock poll={post.poll} voting={voting} onVote={vote} />}

      <div style={actionRowStyle}>
        <button onClick={toggleLike} disabled={liking} style={actionBtnStyle}>
          {post.likedByMe ? <PiHeartFill size={18} color="#EF4444" /> : <PiHeart size={18} />}
          <span style={{ color: post.likedByMe ? "#EF4444" : "#7A8399" }}>{post.likeCount || ""}</span>
        </button>
        <button onClick={() => setCommentsOpen((v) => !v)} style={actionBtnStyle}>
          {commentsOpen ? <PiChatCircleFill size={18} /> : <PiChatCircle size={18} />}
          <span>{post.comments.length || ""}</span>
        </button>
        <button onClick={share} style={actionBtnStyle}>
          <PiShareFat size={18} />
          <span>{post.shareCount || ""}</span>
        </button>
        {shareFeedback && <span style={{ fontSize: 11, color: "#22C55E", marginLeft: "auto" }}>{shareFeedback}</span>}
      </div>

      {commentsOpen && (
        <div style={commentsWrapStyle}>
          {post.comments.length === 0 && (
            <div style={{ fontSize: 12, color: "#7A8399", padding: "8px 0" }}>Aucun commentaire pour l&apos;instant.</div>
          )}
          {post.comments.map((c) => (
            <div key={c._id} style={commentRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.role === "ADMIN" ? "#C9A84C" : "#9CA3AF" }}>
                  {c.role === "ADMIN" ? "Admin" : c.phone}
                </div>
                <div style={{ fontSize: 12.5, color: "#E8EAF0", lineHeight: 1.4 }}>{c.text}</div>
              </div>
              {(c.isMine || user?.role === "ADMIN") && (
                <button
                  onClick={() => deleteComment(c._id)}
                  disabled={deletingCommentId === c._id}
                  style={commentDeleteBtnStyle}
                  aria-label="Supprimer"
                >
                  <PiTrashBold size={13} />
                </button>
              )}
            </div>
          ))}

          {user ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={commentDraft}
                onChange={(e) => { setCommentDraft(e.target.value); setCommentError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }}
                placeholder="Ajouter un commentaire…"
                disabled={commentSending}
                style={commentInputStyle}
              />
              <button onClick={sendComment} disabled={commentSending || !commentDraft.trim()} style={commentSendBtnStyle}>
                <PiPaperPlaneRightBold size={14} />
              </button>
            </div>
          ) : (
            <Link href="/profil" style={{ fontSize: 12, color: "#C9A84C", marginTop: 10, display: "block" }}>
              Connectez-vous pour commenter
            </Link>
          )}
          {commentError && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 6 }}>{commentError}</div>}
        </div>
      )}
    </div>
  );
}

function PollBlock({ poll, voting, onVote }: { poll: ClientPostPoll; voting: "A" | "B" | null; onVote: (o: "A" | "B") => void }) {
  const hasVoted = poll.myVote !== null;
  const pctA = poll.total > 0 ? Math.round((poll.counts.a / poll.total) * 100) : 0;
  const pctB = poll.total > 0 ? 100 - pctA : 0;

  if (!hasVoted) {
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => onVote("A")} disabled={voting !== null} style={pollButtonStyle}>
          {voting === "A" ? "…" : poll.optionALabel}
        </button>
        <button onClick={() => onVote("B")} disabled={voting !== null} style={pollButtonStyle}>
          {voting === "B" ? "…" : poll.optionBLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <PollBar label={poll.optionALabel} pct={pctA} mine={poll.myVote === "A"} />
      <PollBar label={poll.optionBLabel} pct={pctB} mine={poll.myVote === "B"} />
      <div style={{ fontSize: 10.5, color: "#7A8399", marginTop: 4 }}>
        {poll.total} vote{poll.total > 1 ? "s" : ""}
      </div>
    </div>
  );
}

function PollBar({ label, pct, mine }: { label: string; pct: number; mine: boolean }) {
  return (
    <div style={{ position: "relative", marginBottom: 6, borderRadius: 8, overflow: "hidden", background: "#181C24", border: `1px solid ${mine ? "#C9A84C" : "#2A3140"}` }}>
      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg, rgba(201,168,76,0.28), rgba(201,168,76,0.12))", transition: "width 0.6s cubic-bezier(0.32,0.72,0,1)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px" }}>
        <span style={{ fontSize: 12.5, color: "#E8EAF0", fontWeight: mine ? 700 : 500, display: "flex", alignItems: "center", gap: 5 }}>
          {mine && <PiCheckCircleFill size={13} color="#C9A84C" />} {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#C9A84C" }}>{pct}%</span>
      </div>
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14, padding: 16,
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
};

const logoBadgeStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
  background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#C9A84C", fontSize: 12, fontWeight: 700, letterSpacing: "0.5px",
};

const imageWrapStyle: React.CSSProperties = {
  marginBottom: 12, borderRadius: 10, overflow: "hidden", border: "1px solid #2A3140",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 20, paddingTop: 10, borderTop: "1px solid #1F2937",
};

const actionBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", display: "flex", alignItems: "center", gap: 6,
  color: "#7A8399", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 4, fontFamily: "inherit",
};

const commentsWrapStyle: React.CSSProperties = {
  marginTop: 12, paddingTop: 12, borderTop: "1px solid #1F2937",
};

const commentRowStyle: React.CSSProperties = {
  display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #181C24",
};

const commentDeleteBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#7A8399", cursor: "pointer", padding: 4, flexShrink: 0,
};

const commentInputStyle: React.CSSProperties = {
  flex: 1, background: "#181C24", border: "1px solid #2A3140", borderRadius: 8,
  padding: "8px 12px", color: "#E8EAF0", fontSize: 12.5, outline: "none", fontFamily: "inherit",
};

const commentSendBtnStyle: React.CSSProperties = {
  background: "#C9A84C", color: "#0A0C0F", border: "none", borderRadius: 8, width: 36, height: 36,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};

const pollButtonStyle: React.CSSProperties = {
  flex: 1, background: "#181C24", border: "1px solid #2A3140", borderRadius: 8,
  padding: "10px 14px", color: "#E8EAF0", fontSize: 12.5, fontWeight: 700,
  cursor: "pointer", textAlign: "center", fontFamily: "inherit",
};
