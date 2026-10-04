// A viewer counts as "online" in a room as long as their client polled
// within this window (see GroupChatRoom's 3s poll) - wide enough to absorb
// normal request latency/jitter, narrow enough that closing the tab or
// backgrounding it (which pauses polling) drops them out within seconds.
// Shared by the history GET (the count), the online-members list, and the
// "don't push someone who's already looking at the room" check.
export const ONLINE_WINDOW_MS = 15_000;
