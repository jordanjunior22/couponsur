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

        // Convert Buffer images to base64 for JSON serialization
        const pickData = picks.map((pick) => {
            let data: any = pick.toObject ? pick.toObject() : pick;

            // Handle images array
            if (data.images && Array.isArray(data.images)) {
                data.images = data.images.map((img: any) => {
                    let buffer = img.data;

                    // Handle case where toObject() serializes Buffer as { type: "Buffer", data: [...] }
                    if (buffer && typeof buffer === 'object' && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
                        buffer = Buffer.from(buffer.data);
                    }

                    // Convert to base64 string
                    if (Buffer.isBuffer(buffer)) {
                        return { ...img, data: buffer.toString('base64') };
                    } else if (typeof buffer === 'string') {
                        return img; // Already base64
                    }
                    return img;
                });
            }
            return data;
        });

        return NextResponse.json(
            { success: true, data: pickData },
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
            pickType,
            category,
            matchup,
            oddsValue,
            outcome,
            images,
            isImageRestricted,
            couponCode,
        } = body;

        // Validate required fields
        if (!title || !price || !total_odds || !match_date || !league || !pickType) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            );
        }

        // Type-specific validation
        if (pickType === "IMAGE" && (!images || images.length === 0)) {
            return NextResponse.json(
                { success: false, message: "IMAGE type requires at least one image" },
                { status: 400 }
            );
        }

        if (pickType === "SIMPLE" && (!matches || matches.length === 0)) {
            return NextResponse.json(
                { success: false, message: "SIMPLE type requires at least one match" },
                { status: 400 }
            );
        }

        const pickData: any = {
            title,
            price,
            total_odds,
            match_date: new Date(match_date),
            league,
            is_published: is_published ?? false,
            pickType,
            outcome: outcome ?? "PENDING",
        };

        if (category) pickData.category = category;
        if (matchup) pickData.matchup = matchup;
        if (oddsValue) pickData.oddsValue = oddsValue;

        // Handle matches for SIMPLE
        if (pickType === "SIMPLE") {
            pickData.matches = matches;
        } else {
            pickData.matches = [];
        }

        // Handle images for IMAGE type
        if (pickType === "IMAGE" && images && images.length > 0) {
            pickData.images = images.map((img: any) => {
                const base64Data = img.base64 || img;
                const contentType = img.contentType || "image/jpeg";

                // Convert base64 to Buffer
                const imageBuffer = Buffer.from(
                    base64Data.replace(/^data:image\/\w+;base64,/, ""),
                    "base64"
                );

                return {
                    data: imageBuffer,
                    contentType,
                };
            });

            if (isImageRestricted !== undefined) {
                pickData.isImageRestricted = isImageRestricted;
            }
        }

        // Handle coupon code
        if (couponCode && couponCode.code && couponCode.broker) {
            pickData.couponCode = {
                code: couponCode.code,
                broker: couponCode.broker,
            };
        }

        console.log("🔵 About to create pick with data:", {
            pickType,
            hasImages: !!pickData.images,
            imagesCount: pickData.images?.length,
            hasCouponCode: !!pickData.couponCode,
            couponCode: pickData.couponCode,
        });

        const newPick = await Pick.create(pickData);

        console.log("📊 Pick created in DB:", {
            id: newPick._id,
            hasImages: !!newPick.images,
            imagesCount: newPick.images?.length || 0,
            hasCouponCode: !!newPick.couponCode,
            pickType: newPick.pickType,
        });

        // Convert images to base64 for response
        let responseData: any = newPick.toObject ? newPick.toObject() : newPick;

        console.log("📦 Response data before conversion:", {
            hasImages: !!responseData.images,
            imagesCount: responseData.images?.length || 0,
            hasCouponCode: !!responseData.couponCode,
        });

        if (responseData.images && Array.isArray(responseData.images)) {
            responseData.images = responseData.images.map((img: any) => {
                let buffer = img.data;
                if (buffer && typeof buffer === 'object' && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
                    buffer = Buffer.from(buffer.data);
                }
                if (Buffer.isBuffer(buffer)) {
                    return { ...img, data: buffer.toString('base64') };
                }
                return img;
            });
        }

        console.log("✅ Response data after conversion:", {
            hasImages: !!responseData.images,
            imagesCount: responseData.images?.length || 0,
            hasCouponCode: !!responseData.couponCode,
        });

        return NextResponse.json(
            { success: true, data: responseData },
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