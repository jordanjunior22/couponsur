import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { sendPushToAdmins, sendPushToAll } from "@/lib/webpush";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: send a one-off test push ────────────────────────────────────────
// Used by the "Envoyer une notification test" controls in the dashboard's
// Paramètres tab, to check end-to-end delivery (server → web-push → phone
// OS) without waiting for a real event (a purchase, a chat message…).
// Deliberately synchronous (unlike the fire-and-forget sends elsewhere) so
// the button can show exactly how many devices were reached or why zero
// were.
//
// Body: { target?: "admins" | "all" } — defaults to "admins". "all" reaches
// every subscribed visitor/customer, not just admin devices, so the payload
// always says explicitly that it's a test (see body text below) and the UI
// makes the admin confirm before calling this with target "all".
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const target = body?.target === "all" ? "all" : "admins";

    const payload = target === "all"
      ? {
          title: "🔔 Test de notification",
          body: "Ceci est un message de test envoyé par l'équipe Coupon Sur — aucune action requise de votre part.",
          url: "/",
        }
      : {
          title: "🔔 Notification test",
          body: "Si tu vois ceci, les notifications push fonctionnent sur cet appareil.",
          url: "/dashboard",
        };

    const result = target === "all" ? await sendPushToAll(payload) : await sendPushToAdmins(payload);

    return NextResponse.json({ success: true, data: { ...result, target } });
  } catch (error) {
    console.error("TEST PUSH ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'envoi de la notification test" }, { status: 500 });
  }
}
