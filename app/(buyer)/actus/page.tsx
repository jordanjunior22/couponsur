"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PiMegaphoneFill } from "react-icons/pi";
import { PostCard, type ClientPost } from "@/components/PostCard";
import { InlineLoader } from "@/components/LoadingSpinner";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";
import { markActusRead } from "@/hooks/useUnreadPosts";

// The "Actus" feed — admin-authored news + team-vs-team polls. Loaded a page
// at a time (PAGE_SIZE posts), with the next page fetched as the reader
// nears the bottom, instead of pulling the whole feed up front. No
// websocket/SSE backend exists in this project, so freshness is a light poll
// of ONLY the first page, plus an immediate refresh on tab refocus.
const POLL_MS = 60000;
const PAGE_SIZE = 10;

export default function ActusPage() {
  const [posts, setPosts] = useState<ClientPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Read inside observer/poll callbacks without re-creating them.
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  nextCursorRef.current = nextCursor;

  // First page: initial load, and the periodic/refocus refresh. On a
  // refresh the fresh page is MERGED into what's already on screen — posts
  // loaded further down (older pages) are kept, new ones are added on top,
  // and counts (likes, comments, votes) on visible ones are updated.
  const fetchFirstPage = useCallback(async (showSpinner: boolean) => {
    try {
      if (showSpinner) { setLoading(true); setError(null); }
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (!data?.success) {
        if (showSpinner) setError(data?.message || "Erreur inconnue");
        return;
      }
      const fresh: ClientPost[] = data.data;
      if (showSpinner) {
        setPosts(fresh);
        setNextCursor(data.nextCursor);
      } else {
        setPosts((prev) => {
          const freshById = new Map(fresh.map((p) => [p._id, p]));
          const prevIds = new Set(prev.map((p) => p._id));
          const added = fresh.filter((p) => !prevIds.has(p._id));
          // A post the fresh page SHOULD contain but doesn't was deleted or
          // unpublished meanwhile — drop it. "Should contain" = at least as
          // new as the fresh page's oldest entry (or everything, if the
          // fresh page is the whole feed). Older posts simply weren't part
          // of this request, so they're left alone.
          const oldestFresh = fresh.length > 0 ? fresh[fresh.length - 1].createdAt : null;
          const covered = (p: ClientPost) => !data.nextCursor || (oldestFresh !== null && p.createdAt >= oldestFresh);
          const kept = prev
            .filter((p) => freshById.has(p._id) || !covered(p))
            .map((p) => freshById.get(p._id) ?? p);
          return [...added, ...kept];
        });
      }
      markActusRead();
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (showSpinner && isMountedRef.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}&before=${encodeURIComponent(cursor)}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data?.success) {
        setPosts((prev) => {
          const known = new Set(prev.map((p) => p._id));
          return [...prev, ...(data.data as ClientPost[]).filter((p) => !known.has(p._id))];
        });
        setNextCursor(data.nextCursor);
      } else {
        setMoreError(true);
      }
    } catch {
      if (isMountedRef.current) setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchFirstPage(true);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchFirstPage(false);
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchFirstPage(false); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchFirstPage]);

  // Fetch the next page when the sentinel at the bottom comes within ~600px
  // of the viewport — before the reader actually hits the end.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !moreError) loadMore(); },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadMore, moreError, posts.length]);

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
            <button onClick={() => fetchFirstPage(true)} style={retryBtnStyle}>Réessayer</button>
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

            {nextCursor && (
              <div ref={sentinelRef} style={{ padding: "8px 16px 24px", textAlign: "center" }}>
                {moreError ? (
                  <button onClick={() => { setMoreError(false); loadMore(); }} style={retryBtnStyle}>Réessayer</button>
                ) : (
                  loadingMore && <InlineLoader size={26} label="Chargement…" padding="12px 0" />
                )}
              </div>
            )}
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
