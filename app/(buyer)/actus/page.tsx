"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PiMegaphoneFill } from "react-icons/pi";
import { PostCard, type ClientPost } from "@/components/PostCard";
import { InlineLoader } from "@/components/LoadingSpinner";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";
import { markActusRead } from "@/hooks/useUnreadPosts";
import { useAuth } from "@/context/AuthContext";
import { readPostsCache, writePostsCache } from "@/lib/postsCache";

// The "Actus" feed — admin-authored news + team-vs-team polls.
//   - Opens INSTANTLY onto the last-known posts (lib/postsCache.ts), then
//     refreshes behind them.
//   - Loaded a page at a time (PAGE_SIZE), the next page fetched as the reader
//     nears the bottom.
//   - LIVE: every LIVE_POLL_MS it asks only "what changed since X?" - almost
//     always an empty answer - so likes, comments and votes from other people
//     appear within seconds, without re-downloading the feed.
//   - A slower FULL_REFRESH_MS refresh of the first page also catches deletions
//     and unpublished posts, which a "changed since" question can't see.
const LIVE_POLL_MS = 8000;
const FULL_REFRESH_MS = 60000;
const PAGE_SIZE = 10;
// A post you just liked / commented on ignores a poll answer for this long, so a
// poll that started a moment BEFORE your tap can't briefly undo it.
const LOCAL_CHANGE_GRACE_MS = 5000;

function maxUpdatedAt(posts: ClientPost[], current: string | null): string | null {
  let best = current;
  for (const p of posts) {
    const t = p.updatedAt ?? p.createdAt;
    if (!best || t > best) best = t;
  }
  return best;
}

export default function ActusPage() {
  const { user, loading: authLoading } = useAuth();
  const viewerKey = user?._id ?? "anon";

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
  const postsRef = useRef<ClientPost[]>([]);
  postsRef.current = posts;
  const sinceRef = useRef<string | null>(null);
  const touchedRef = useRef(new Map<string, number>());
  const initialFetchStartedRef = useRef(false);
  const cacheHydratedRef = useRef(false);

  // First page: initial load, and the slower full refresh. On a refresh the
  // fresh page is MERGED into what's already on screen — posts loaded further
  // down are kept, new ones are added on top, and counts on visible ones update.
  const fetchFirstPage = useCallback(async (showSpinner: boolean) => {
    try {
      if (showSpinner && postsRef.current.length === 0) { setLoading(true); setError(null); }
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}`, { credentials: "include" });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (!data?.success) {
        if (showSpinner && postsRef.current.length === 0) setError(data?.message || "Erreur inconnue");
        return;
      }
      const fresh: ClientPost[] = data.data;
      sinceRef.current = maxUpdatedAt(fresh, sinceRef.current);
      if (showSpinner) {
        // Replace the (possibly cached) first page, but keep any older pages
        // already loaded below it.
        setPosts((prev) => {
          const oldestFresh = fresh.length > 0 ? fresh[fresh.length - 1].createdAt : null;
          const older = oldestFresh ? prev.filter((p) => p.createdAt < oldestFresh) : [];
          return [...fresh, ...older];
        });
        setNextCursor((cur) => (postsRef.current.some((p) => fresh.length > 0 && p.createdAt < fresh[fresh.length - 1].createdAt) ? cur : data.nextCursor));
      } else {
        setPosts((prev) => {
          const freshById = new Map(fresh.map((p) => [p._id, p]));
          const prevIds = new Set(prev.map((p) => p._id));
          const added = fresh.filter((p) => !prevIds.has(p._id));
          // A post the fresh page SHOULD contain but doesn't was deleted or
          // unpublished meanwhile — drop it. "Should contain" = at least as new
          // as the fresh page's oldest entry (or everything, if the fresh page is
          // the whole feed). Older posts weren't part of this request, so they
          // are left alone.
          const oldestFresh = fresh.length > 0 ? fresh[fresh.length - 1].createdAt : null;
          const covered = (p: ClientPost) => !data.nextCursor || (oldestFresh !== null && p.createdAt >= oldestFresh);
          const now = Date.now();
          const kept = prev
            .filter((p) => freshById.has(p._id) || !covered(p))
            .map((p) => {
              const t = touchedRef.current.get(p._id);
              if (t && now - t < LOCAL_CHANGE_GRACE_MS) return p;
              return freshById.get(p._id) ?? p;
            });
          return [...added, ...kept];
        });
      }
      markActusRead();
    } catch (err) {
      if (showSpinner && postsRef.current.length === 0) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (showSpinner && isMountedRef.current) setLoading(false);
    }
  }, []);

  // The few-seconds live check: only what changed after the newest thing we have.
  const pollChanges = useCallback(async () => {
    const since = sinceRef.current;
    if (!since) return;
    try {
      const res = await fetch(`/api/posts?since=${encodeURIComponent(since)}`, { credentials: "include" });
      const data = await res.json();
      if (!isMountedRef.current || !data?.success) return;
      const fresh: ClientPost[] = data.data;
      if (fresh.length === 0) return;
      sinceRef.current = maxUpdatedAt(fresh, sinceRef.current);
      setPosts((prev) => {
        const byId = new Map(fresh.map((p) => [p._id, p]));
        const known = new Set(prev.map((p) => p._id));
        const now = Date.now();
        const updated = prev.map((p) => {
          const f = byId.get(p._id);
          if (!f) return p;
          const t = touchedRef.current.get(p._id);
          return t && now - t < LOCAL_CHANGE_GRACE_MS ? p : f;
        });
        // Brand-new posts (newer than the newest we show) go on top. A changed
        // post from an older page we haven't loaded is ignored - it'll be right
        // when that page loads.
        const newest = prev[0]?.createdAt ?? "";
        const added = fresh
          .filter((p) => !known.has(p._id) && p.createdAt > newest)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return added.length > 0 ? [...added, ...updated] : updated;
      });
    } catch {
      /* the next tick tries again */
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}&before=${encodeURIComponent(cursor)}`, { credentials: "include" });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (data?.success) {
        sinceRef.current = maxUpdatedAt(data.data as ClientPost[], sinceRef.current);
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

  // Show the last-known posts INSTANTLY once we know whose feed it is (likes are
  // personal), then the normal fetch below refreshes them.
  useEffect(() => {
    if (authLoading || cacheHydratedRef.current) return;
    cacheHydratedRef.current = true;
    const cached = readPostsCache(viewerKey);
    if (!cached || cached.posts.length === 0) return;
    setPosts((prev) => (prev.length > 0 ? prev : cached.posts));
    setNextCursor((cur) => cur ?? cached.nextCursor);
    sinceRef.current = maxUpdatedAt(cached.posts, sinceRef.current);
    setLoading(false);
  }, [authLoading, viewerKey]);

  // Keep that cache current (a moment after the last change, not on every one).
  useEffect(() => {
    if (authLoading || loading) return;
    const t = setTimeout(() => writePostsCache(viewerKey, postsRef.current, nextCursorRef.current), 800);
    return () => clearTimeout(t);
  }, [posts, nextCursor, loading, authLoading, viewerKey]);

  useEffect(() => {
    isMountedRef.current = true;
    // The first fetch doesn't wait for the "who am I" check - the endpoint reads
    // the cookie itself - so it runs in parallel with it.
    if (!initialFetchStartedRef.current) {
      initialFetchStartedRef.current = true;
      fetchFirstPage(true);
    }
    const liveInterval = setInterval(() => {
      if (document.visibilityState === "visible") pollChanges();
    }, LIVE_POLL_MS);
    const fullInterval = setInterval(() => {
      if (document.visibilityState === "visible") fetchFirstPage(false);
    }, FULL_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      pollChanges();
      fetchFirstPage(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      isMountedRef.current = false;
      clearInterval(liveInterval);
      clearInterval(fullInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchFirstPage, pollChanges]);

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

  const updatePost = (updated: ClientPost, local?: boolean) => {
    if (local) touchedRef.current.set(updated._id, Date.now());
    sinceRef.current = maxUpdatedAt([updated], sinceRef.current);
    setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
  };

  return (
    // No horizontal padding here on purpose — PostCard's photos bleed to
    // the true screen edges (its header/caption/etc. carry their own 16px
    // inset), the same full-bleed-media feel a native feed app has. Only
    // the title and the loading/empty states need their own inset since
    // they live outside PostCard.
    <main style={{ minHeight: "100vh", background: "#0A0C0F", paddingTop: 16, paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <style>{`
        .actus-skel { background: linear-gradient(90deg, #14181D 0%, #1C2128 50%, #14181D 100%); background-size: 200% 100%; animation: actusShimmer 1.3s ease-in-out infinite; }
        @keyframes actusShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { .actus-skel { animation: none; } }
      `}</style>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={titleStyle}><PiMegaphoneFill size={17} /> Actus</div>

        {loading && posts.length === 0 && <PostSkeletons />}

        {!loading && error && posts.length === 0 && (
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

        {posts.length > 0 && (
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

// Placeholder posts shown while the very first page loads (nothing cached yet):
// the screen has its final shape immediately instead of a spinner on an empty page.
function PostSkeletons() {
  return (
    <div aria-busy="true" aria-label="Chargement des actus">
      {[0, 1].map((i) => (
        <div key={i} style={{ borderBottom: "1px solid #1F1F1F", paddingBottom: 14, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px" }}>
            <div className="actus-skel" style={{ width: 32, height: 32, borderRadius: "50%" }} />
            <div className="actus-skel" style={{ width: 110, height: 12, borderRadius: 6 }} />
          </div>
          <div className="actus-skel" style={{ width: "100%", aspectRatio: "1 / 1" }} />
          <div style={{ padding: "12px 16px 0" }}>
            <div className="actus-skel" style={{ width: 90, height: 12, borderRadius: 6, marginBottom: 10 }} />
            <div className="actus-skel" style={{ width: "92%", height: 11, borderRadius: 6, marginBottom: 7 }} />
            <div className="actus-skel" style={{ width: "64%", height: 11, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
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
