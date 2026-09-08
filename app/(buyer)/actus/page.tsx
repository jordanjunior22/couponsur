"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PiMegaphoneFill } from "react-icons/pi";
import { PostCard, type ClientPost } from "@/components/PostCard";
import { InlineLoader } from "@/components/LoadingSpinner";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// The "Actus" feed — admin-authored news + team-vs-team polls. Same
// polling shape PremiumPicksPage already uses for /api/picks: fetch on
// mount, a light interval poll, and an immediate refresh on tab refocus —
// no websocket/SSE backend exists in this project.
const POLL_MS = 60000;

export default function ActusPage() {
  const [posts, setPosts] = useState<ClientPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchPosts = useCallback(async (showSpinner: boolean) => {
    try {
      if (showSpinner) { setLoading(true); setError(null); }
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data?.success) setPosts(data.data);
      else if (showSpinner) setError(data?.message || "Erreur inconnue");
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (showSpinner && isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchPosts(true);
    const interval = setInterval(() => fetchPosts(false), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchPosts(false); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchPosts]);

  const updatePost = (updated: ClientPost) => {
    setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
  };

  return (
    // No horizontal padding here on purpose — PostCard's photos bleed to
    // the true screen edges (its header/caption/etc. carry their own 16px
    // inset), the same full-bleed-media feel a native feed app has. Only
    // the title and the loading/empty states need their own inset since
    // they live outside PostCard.
    <main style={{ minHeight: "100vh", background: "#0A0C0F", paddingTop: 16, paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={titleStyle}><PiMegaphoneFill size={17} /> Actus</div>

        {loading && <InlineLoader size={36} label="Chargement…" padding="60px 16px" />}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#7A8399" }}>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Impossible de charger les actus.</div>
            <button onClick={() => fetchPosts(true)} style={retryBtnStyle}>Réessayer</button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 16px", color: "#7A8399" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, marginBottom: 8 }}>Aucune actu pour l&apos;instant</div>
            <div style={{ fontSize: 12 }}>Revenez bientôt.</div>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {posts.map((post) => (
              <PostCard key={post._id} post={post} onUpdate={updatePost} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 15, fontWeight: 700, color: "#C9A84C", marginBottom: 14, padding: "0 16px",
};

const retryBtnStyle: React.CSSProperties = {
  background: "#C9A84C", color: "#0A0C0F", border: "none", borderRadius: 8,
  padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
