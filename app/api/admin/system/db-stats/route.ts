import { NextResponse } from "next/server";
import mongoose from "mongoose";
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

// ─── GET: live MongoDB storage footprint (ADMIN ONLY) ───────────────────────
// Powers the System tab's database card. `db.stats()`/`collStats` report
// actual usage, not the Atlas tier's cap — Atlas doesn't expose "which
// plan/limit am I on" over a normal driver connection, so the ceiling used
// to compute a percentage is settings.dbStorageLimitMb, an admin-set number
// (see models/Settings.ts).
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ success: false, message: "Database not connected" }, { status: 500 });
    }

    const [stats, settings, collectionInfos] = await Promise.all([
      db.stats(),
      getSettings(),
      db.listCollections().toArray(),
    ]);

    const collections = await Promise.all(
      collectionInfos.map(async (c) => {
        try {
          const cs = await db.command({ collStats: c.name });
          return {
            name: c.name,
            count: cs.count ?? 0,
            dataBytes: cs.size ?? 0,
            avgObjBytes: cs.avgObjSize ?? 0,
            storageBytes: cs.storageSize ?? 0,
            indexBytes: cs.totalIndexSize ?? 0,
          };
        } catch {
          // A collection can fail collStats (e.g. a view) without that
          // being worth failing the whole request over.
          return { name: c.name, count: 0, dataBytes: 0, avgObjBytes: 0, storageBytes: 0, indexBytes: 0 };
        }
      })
    );
    collections.sort((a, b) => b.dataBytes - a.dataBytes);

    return NextResponse.json({
      success: true,
      data: {
        dataBytes: stats.dataSize,
        storageBytes: stats.storageSize,
        indexBytes: stats.indexSize,
        totalBytes: stats.storageSize + stats.indexSize,
        objects: stats.objects,
        collectionCount: stats.collections,
        // Missing on any Settings doc created before this field existed —
        // same "falls back to the schema default" convention used
        // everywhere else in this file.
        limitMb: settings.dbStorageLimitMb ?? 512,
        collections,
      },
    });
  } catch (error) {
    console.error("DB STATS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch database stats" }, { status: 500 });
  }
}
