import type { Metadata } from "next";
import { ChatRoomScreen } from "@/components/ChatRoomScreen";

export const metadata: Metadata = {
  title: "Chat Global — Coupon Sûr",
};

export default function GroupeGlobalPage() {
  return <ChatRoomScreen room="global" title="Chat Global" subtitle="Ouvert à tous les membres connectés" icon="🌍" />;
}
