import { NextRequest, NextResponse } from "next/server";
import { PLACES } from "@/lib/config";
import {
  getNearbyReviewCorpusPlaces,
  getReviewCorpusReviews,
  markReviewCorpusReviewRead,
} from "@/lib/db";

export const runtime = "nodejs";

type LocalPlaceReviewRequest = {
  placeId?: string;
  reviewId?: string;
  reviewText?: string;
  action?: "markRead";
  targetRating?: number;
  minLength?: number;
  maxLength?: number;
  cooldownMinutes?: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const targetRatingRaw = searchParams.get("targetRating");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng required", places: [], nextPageToken: null },
      { status: 400 },
    );
  }

  const latNumber = Number(lat);
  const lngNumber = Number(lng);
  if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) {
    return NextResponse.json(
      { error: "valid lat and lng required", places: [], nextPageToken: null },
      { status: 400 },
    );
  }

  try {
    const places = getNearbyReviewCorpusPlaces({
      lat: latNumber,
      lng: lngNumber,
      limit: PLACES.LOCAL_CORPUS_NEAREST_PLACE_LIMIT,
      targetRating: targetRatingRaw ? Number(targetRatingRaw) : undefined,
    });
    return NextResponse.json({
      places,
      nextPageToken: null,
      source: "local",
    });
  } catch (error) {
    console.error("Local review corpus fetch error:", error);
    return NextResponse.json({
      error: "Local review corpus unavailable",
      places: [],
      nextPageToken: null,
      source: "local",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LocalPlaceReviewRequest;
    const { placeId } = body;

    if (!placeId) {
      return NextResponse.json({ error: "placeId required", reviews: [] }, { status: 400 });
    }

    try {
      if (body.action === "markRead") {
        const marked = markReviewCorpusReviewRead({
          placeId,
          reviewId: body.reviewId,
          reviewText: body.reviewText,
        });
        return NextResponse.json({
          ok: marked,
          source: "local",
        });
      }

      return NextResponse.json({
        name: null,
        types: [],
        reviews: getReviewCorpusReviews(placeId, {
          targetRating: body.targetRating,
          minLength: body.minLength,
          maxLength: body.maxLength,
          cooldownMinutes: body.cooldownMinutes,
        }),
        source: "local",
      });
    } catch (error) {
      console.error("Local review corpus details error:", error);
      return NextResponse.json({
        error: "Local review corpus unavailable",
        reviews: [],
        source: "local",
      });
    }
  } catch (error) {
    console.error("Review corpus request error:", error);
    return NextResponse.json({ error: "Fetch failed", reviews: [] });
  }
}
