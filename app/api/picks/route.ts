import { NextRequest, NextResponse } from "next/server";
import Pick from "@/models/Picks";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
// ─── GET: Fetch Picks ────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);

        const league = searchParams.get("league");
        const outcome = searchParams.get("outcome");
        const published = searchParams.get("published");

        const query: any = {};

        if (league) query.league = league;
        if (outcome) query.outcome = outcome;
        if (published) query.is_published = published === "true";

        const picks = await Pick.find(query).sort({ match_date: -1 });

        return NextResponse.json(
            { success: true, data: picks },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET PICKS ERROR:", error);

        return NextResponse.json(
            { success: false, message: "Failed to fetch picks" },
            { status: 500 }
        );
    }
}

// ─── POST: ADMIN ONLY ────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        await connectDB();

        // 🔐 Get token from cookie
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;

        if (!token) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        const decoded = verifyToken(token);

        if (!decoded) {
            return NextResponse.json(
                { success: false, message: "Invalid token" },
                { status: 401 }
            );
        }

        // 🔒 Only ADMIN can create picks
        if (decoded.role !== "ADMIN") {
            return NextResponse.json(
                { success: false, message: "Forbidden" },
                { status: 403 }
            );
        }

        // ─── Continue with creation ───────────────────────────
        const body = await req.json();

        const {
            title,
            price,
            total_odds,
            match_date,
            league,
            matches,
            is_published,
        } = body;

        if (!title || !price || !total_odds || !match_date || !league || !matches) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            );
        }

        const newPick = await Pick.create({
            title,
            price,
            total_odds,
            match_date: new Date(match_date),
            league,
            matches,
            is_published: is_published ?? false,
        });

        return NextResponse.json(
            { success: true, data: newPick },
            { status: 201 }
        );
    } catch (error) {
        console.error("CREATE PICK ERROR:", error);

        return NextResponse.json(
            { success: false, message: "Failed to create pick" },
            { status: 500 }
        );
    }
}