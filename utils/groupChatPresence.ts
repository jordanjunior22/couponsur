// A viewer counts as "online" in a room as long as their client polled
// within this window (see GroupChatRoom's 3s poll) - wide enough to absorb
// normal request latency/jitter, narrow enough that closing the tab or
// backgrounding it (which pauses polling) drops them out within seconds.
// Shared by the history GET (the count), the online-members list, and the
// "don't push someone who's already looking at the room" check.
export const ONLINE_WINDOW_MS = 15_000;

// A typing ping stays "fresh" this long. The client pings at most every ~2.5s
// while someone is actually typing, so it comfortably outlasts one gap
// without lingering after they stop.
export const TYPING_WINDOW_MS = 5_000;
