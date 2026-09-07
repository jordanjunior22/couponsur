import type { Metadata } from "next";
import { ChatRoomScreen } from "@/components/ChatRoomScreen";

export const metadata: Metadata = {
  title: "Groupe Premium — Coupon Sûr",
};

export default function GroupePremiumPage() {
  return <ChatRoomScreen room="premium" title="Groupe Premium" subtitle="Réservé aux abonnés & à l'équipe" icon="👑" />;
}
