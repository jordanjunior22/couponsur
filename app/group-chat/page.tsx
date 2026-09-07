import { redirect } from "next/navigation";

// The premium group chat now lives at /groupe, as a tab inside the buyer
// app's bottom tab bar (app/(buyer)/groupe/page.tsx) instead of its own
// chrome-less route. Kept as a redirect rather than deleted — this old URL
// may still be bookmarked or linked from a push notification.
export default function GroupChatRedirect() {
  redirect("/groupe");
}
