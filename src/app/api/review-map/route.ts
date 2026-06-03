import { NextResponse } from "next/server";
import { HAGUE_REGION, PLACES, REVIEWS } from "@/lib/config";
import { getReviewCorpusMapPlaces } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const places = getReviewCorpusMapPlaces();
    return NextResponse.json({
      places,
      defaults: {
        wanderRegion: HAGUE_REGION,
        searchRadius: PLACES.SEARCH_RADIUS,
        detectionRadius: PLACES.DETECTION_RADIUS,
        targetRating: REVIEWS.TARGET_RATING,
      },
    });
  } catch (error) {
    console.error("Review map fetch error:", error);
    return NextResponse.json(
      { error: "Review map data unavailable", places: [] },
      { status: 500 },
    );
  }
}
