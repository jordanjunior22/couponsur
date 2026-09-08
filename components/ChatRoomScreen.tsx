"use client";

import { useRouter } from "next/navigation";
import GroupChatRoom from "@/components/GroupChatRoom";
import type { GroupRoom } from "@/models/GroupMessage";
import { TOP_BAR_HEIGHT } from "@/lib/layoutConstants";

// Thin client wrapper so the two actual room pages (app/(buyer)/groupe/
// premium and /global) can stay server components and keep their own
// <title> via `metadata` — only this piece needs useRouter (for "close"
// going back to the room picker at /groupe) and the height-constrained
// container GroupChatRoom fills edge-to-edge.
//
// BottomTabBar hides itself entirely on these two routes (see its own
// `inChatRoom` check) so the room only has to give back room for the top
// bar and, on notch devices, the raw home-indicator inset — not the
// floating tab bar's own footprint, which no longer occupies any space
// here.
export function ChatRoomScreen({ room, title, subtitle, icon }: { room: GroupRoom; title: string; subtitle: string; icon: string }) {
  const router = useRouter();
  return (
    <div style={{ height: `calc(100dvh - ${TOP_BAR_HEIGHT}px - env(safe-area-inset-bottom))`, overflow: "hidden" }}>
      <GroupChatRoom room={room} title={title} subtitle={subtitle} icon={icon} onClose={() => router.push("/groupe")} />
    </div>
  );
}
