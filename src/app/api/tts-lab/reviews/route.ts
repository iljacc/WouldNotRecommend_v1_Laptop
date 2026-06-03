import { NextResponse } from "next/server";
import { REVIEWS } from "@/lib/config";
import { getTtsLabReviewSamples } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({
      reviews: getTtsLabReviewSamples({
        targetRating: REVIEWS.TARGET_RATING,
        minLength: REVIEWS.MIN_LENGTH,
        maxLength: REVIEWS.MAX_LENGTH,
        limit: 24,
      }),
    });
  } catch (error) {
    console.error("TTS lab review samples error:", error);
    return NextResponse.json(
      { error: "Review samples unavailable", reviews: [] },
      { status: 500 },
    );
  }
}
