import type { Metadata } from "next";
import GroupChatRoom from "@/components/GroupChatRoom";

// Deliberately its own top-level route (not nested under the (buyer) group)
// so it renders with none of that group's chrome (Navbar/Footer) — a
// full-screen room you navigate to and close back to "/", not a popup.
export const metadata: Metadata = {
  title: "Groupe Premium — Coupon Sûr",
};

export default function GroupChatPage() {
  return <GroupChatRoom />;
}
