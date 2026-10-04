// Makes opening a chat room feel instant.
//
// The slow part of opening a room was never drawing it - it was waiting for the
// network before there was anything to show. So the last messages of each room
// are remembered on the device (in memory for the current visit, and in
// localStorage so they survive a reload) and shown IMMEDIATELY; the room then
// refreshes in the background and swaps in anything newer. The room list also
// warms this cache before the user taps (see prefetchRoom).
//
// Only text-side data is stored (pictures are just URLs), capped to the latest
// few messages per room, and keyed by account so one person's cache is never
// read by another login.
import type { GroupRoom } from "@/models/GroupMessage";

const KEEP_MESSAGES = 40;
const STORAGE_PREFIX = "groupchat_cache:";

interface Snapshot<T> {
  messages: T[];
  hasMore: boolean;
  at: number;
}

const memory = new Map<string, Snapshot<unknown>>();

const keyFor = (userId: string, room: GroupRoom) => `${userId}:${room}`;

export function readRoomCache<T>(userId: string, room: GroupRoom): Snapshot<T> | null {
  const key = keyFor(userId, room);
  const inMemory = memory.get(key);
  if (inMemory) return inMemory as Snapshot<T>;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!Array.isArray(parsed.messages)) return null;
    memory.set(key, parsed as Snapshot<unknown>);
    return parsed;
  } catch {
    return null;
  }
}

export function writeRoomCache<T extends { pending?: boolean; failed?: boolean }>(
  userId: string,
  room: GroupRoom,
  messages: T[],
  hasMore: boolean
) {
  // Never keep a message that hasn't reached the server.
  const all = messages.filter((m) => !m.pending && !m.failed);
  const confirmed = all.slice(-KEEP_MESSAGES);
  // If older messages were trimmed away, there is more history above what we keep.
  const snapshot: Snapshot<T> = { messages: confirmed, hasMore: hasMore || all.length > KEEP_MESSAGES, at: Date.now() };
  const key = keyFor(userId, room);
  memory.set(key, snapshot as Snapshot<unknown>);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot));
  } catch {
    /* storage full / blocked - the in-memory copy still works for this visit */
  }
}

// Fetches a room's latest messages ahead of the user opening it, so the room
// has something to show the instant it mounts. `hb=0` keeps it from counting
// as the user being "in" the room.
const inFlight = new Set<string>();
export async function prefetchRoom(userId: string, room: GroupRoom, maxAgeMs = 8000) {
  const key = keyFor(userId, room);
  const existing = memory.get(key);
  if (existing && Date.now() - existing.at < maxAgeMs) return;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const res = await fetch(`/api/group-chat?room=${room}&hb=0`, { credentials: "include" });
    const data = await res.json();
    if (data?.success && Array.isArray(data.data)) {
      writeRoomCache(userId, room, data.data, !!data.hasMore);
    }
  } catch {
    /* best-effort - opening the room just loads it normally */
  } finally {
    inFlight.delete(key);
  }
}

// Profile pictures already fetched this visit, shared across rooms and across
// leaving/re-entering a room (kept in memory only: they are large).
export const avatarMemory = new Map<string, string | null>();
