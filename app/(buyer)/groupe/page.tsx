import type { Metadata } from "next";
import GroupChatRoom from "@/components/GroupChatRoom";
import { BOTTOM_SAFE_OFFSET, TOP_BAR_HEIGHT } from "@/lib/layoutConstants";

export const metadata: Metadata = {
  title: "Groupe Premium — Coupon Sûr",
};

// GroupChatRoom fills its container edge-to-edge (100% height, its own
// scroll region for messages) — here that container is the viewport minus
// BOTH the top bar and the bottom tab bar, so the composer never ends up
// underneath either one.
export default function GroupePage() {
  return (
    <div style={{ height: `calc(100dvh - ${TOP_BAR_HEIGHT}px - ${BOTTOM_SAFE_OFFSET})`, overflow: "hidden" }}>
      <GroupChatRoom />
    </div>
  );
}
