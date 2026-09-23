import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSettings } from "@/models/Settings";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

const VERCEL_API = "https://api.vercel.com";

async function vercelFetch(path: string, token: string) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

// ─── GET: Vercel project/deployment/usage snapshot (ADMIN ONLY) ────────────
// Powers the System tab's Vercel card. Gated behind two things, in order:
//   1. settings.vercelSyncEnabled — off by default, flipped on from the
//      dashboard once an admin is ready (see models/Settings.ts). Kept
//      server-side rather than just hidden client-side so a disabled sync
//      never calls out to Vercel at all.
//   2. VERCEL_API_TOKEN / VERCEL_PROJECT_ID env vars actually being set —
//      never stored in the DB (same posture as every other secret in this
//      project — FAPSHI_API_KEY, JWT_SECRET, etc. are all env-only).
// Project/deployment info works on any Vercel plan; only the `/v1/usage`
// call is Pro/Enterprise-gated (confirmed empirically: Hobby returns
// `plan_upgrade_required`) — that failure is reported as data, not an
// error, so the card can show everything else regardless of plan.
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const settings = await getSettings();
    if (settings.vercelSyncEnabled !== true) {
      return NextResponse.json({ success: true, data: { syncEnabled: false } });
    }

    const token = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID; // optional — every Vercel account is team-scoped post-"Northstar" migration, but a legacy personal-scope token may not need it

    if (!token || !projectId) {
      return NextResponse.json({
        success: true,
        data: {
          syncEnabled: true,
          configured: false,
          missingEnvVars: [!token && "VERCEL_API_TOKEN", !projectId && "VERCEL_PROJECT_ID"].filter(Boolean) as string[],
        },
      });
    }

    const teamQs = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";

    const [projectRes, deploysRes] = await Promise.all([
      vercelFetch(`/v9/projects/${projectId}?${teamQs.slice(1)}`, token),
      vercelFetch(`/v6/deployments?projectId=${projectId}&limit=10${teamQs}`, token),
    ]);

    const project = projectRes.ok
      ? {
          name: projectRes.data.name,
          framework: projectRes.data.framework,
          nodeVersion: projectRes.data.nodeVersion,
          region: projectRes.data.serverlessFunctionRegion ?? null,
          cronCount: (projectRes.data.crons?.definitions || []).length,
          domains: (projectRes.data.targets?.production?.alias || []) as string[],
        }
      : null;

    interface RawDeployment {
      created: number;
      ready?: number;
      state: string;
      target?: string | null;
    }

    const deployments = deploysRes.ok
      ? ((deploysRes.data.deployments || []) as RawDeployment[]).map((d) => ({
          createdAt: d.created,
          state: d.state,
          target: d.target || "preview",
          buildSeconds: d.ready ? Math.round((d.ready - d.created) / 1000) : null,
        }))
      : [];

    // Real bandwidth/function-execution-vs-limit data lives only behind
    // this endpoint — surfaced as-is (`usage.data`, untyped) rather than
    // reshaped into an assumed schema, since this project has never seen a
    // successful payload from it to model types against (only the
    // plan_upgrade_required error, on the Hobby account this was built
    // against). Once synced on a real Pro team, adjust the System tab's
    // renderer to the fields that actually come back.
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const usageRes = await vercelFetch(`/v1/usage?from=${from}&to=${to}${teamQs}`, token);

    return NextResponse.json({
      success: true,
      data: {
        syncEnabled: true,
        configured: true,
        project,
        deployments,
        usage: usageRes.ok ? usageRes.data : null,
        usageErrorCode: usageRes.ok ? null : usageRes.data?.error?.code ?? "unknown",
        usageErrorMessage: usageRes.ok ? null : usageRes.data?.error?.message ?? "Failed to fetch usage",
      },
    });
  } catch (error) {
    console.error("VERCEL STATS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch Vercel stats" }, { status: 500 });
  }
}
