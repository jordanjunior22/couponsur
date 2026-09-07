import { redirect } from "next/navigation";

// The premium group chat now lives at /groupe/premium — /groupe itself is
// the "Chat" tab's room picker (Premium + Global) since the Global room
// shipped. Kept as a redirect rather than deleted — this old URL may still
// be bookmarked or linked from a push notification.
export default function GroupChatRedirect() {
  redirect("/groupe/premium");
}
