import { NextRequest, NextResponse } from "next/server";
import { PLACES } from "@/lib/config";
import {
  getNearbyReviewCorpusPlaces,
  getReviewCorpusReviews,
  markReviewCorpusReviewRead,
} from "@/lib/db";
import {
  getNearbyLazyFirstPage,
  getNearbyLazyNextPage,
  getNearbyPlacesWithCache,
} from "./nearby-fetch";

export const runtime = "nodejs";

const API_KEY =
  process.env.PLACES_API_KEY || process.env.GEOCODING_API_KEY;

function shouldReadLocalReviewCorpus(): boolean {
  const source = (process.env.REVIEW_SOURCE || "").toLowerCase();
  return source === "local" || source === "corpus" || source === "sqlite";
}

type PlaceReview = {
  text?: string;
  rating?: number;
  author_name?: string;
  relative_time_description?: string;
};

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
  const radius = searchParams.get("radius") || "200";
  const targetRatingRaw = searchParams.get("targetRating");
  const maxPagesRaw = searchParams.get("maxPages");
  const cacheTtlRaw = searchParams.get("cacheTtlMs");
  const lazy =
    searchParams.get("lazy") === "1" || searchParams.get("lazy") === "true";
  const pageTokenParam =
    searchParams.get("pageToken") ?? searchParams.get("pagetoken");

  const maxPages = maxPagesRaw
    ? Math.min(3, Math.max(1, parseInt(maxPagesRaw, 10) || PLACES.NEARBY_SEARCH_MAX_PAGES))
    : PLACES.NEARBY_SEARCH_MAX_PAGES;
  const cacheTtlMs = cacheTtlRaw
    ? Math.max(0, parseInt(cacheTtlRaw, 10) || 0)
    : PLACES.NEARBY_CACHE_TTL_MS;

  if (shouldReadLocalReviewCorpus()) {
    if (!lat || !lng) {
      return NextResponse.json(
        { error: "lat and lng required", places: [], nextPageToken: null },
        { status: 400 },
      );
    }

    try {
      const places = getNearbyReviewCorpusPlaces({
        lat: Number(lat),
        lng: Number(lng),
        radius: Number(radius) || PLACES.SEARCH_RADIUS,
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

  if (!API_KEY) {
    return NextResponse.json({ error: "Google API key not configured", places: [] });
  }

  try {
    if (pageTokenParam) {
      const { places, nextPageToken, error } = await getNearbyLazyNextPage({
        pageToken: pageTokenParam,
        apiKey: API_KEY,
      });
      if (error) {
        console.error("Places API error (lazy next):", error);
        return NextResponse.json({ error, places, nextPageToken: null });
      }
      return NextResponse.json({ places, nextPageToken });
    }

    if (lazy) {
      if (!lat || !lng) {
        return NextResponse.json(
          { error: "lat and lng required", places: [], nextPageToken: null },
          { status: 400 },
        );
      }
      const { places, nextPageToken, error } = await getNearbyLazyFirstPage({
        lat,
        lng,
        radius,
        apiKey: API_KEY,
        cacheTtlMs,
      });
      if (error) {
        console.error("Places API error (lazy first):", error);
        return NextResponse.json({ error, places, nextPageToken: null });
      }
      return NextResponse.json({ places, nextPageToken });
    }

    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng required", places: [] }, { status: 400 });
    }

    const { places, error } = await getNearbyPlacesWithCache({
      lat,
      lng,
      radius,
      apiKey: API_KEY,
      maxPages,
      cacheTtlMs,
    });

    if (error) {
      console.error("Places API error:", error);
      return NextResponse.json({ error, places });
    }

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Places fetch error:", error);
    return NextResponse.json({ error: "Fetch failed", places: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LocalPlaceReviewRequest;
    const { placeId } = body;

    if (!placeId) {
      return NextResponse.json({ error: "placeId required", reviews: [] }, { status: 400 });
    }

    if (shouldReadLocalReviewCorpus()) {
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
    }

    if (!API_KEY) {
      return NextResponse.json({ error: "Google API key not configured", reviews: [] });
    }

    const detailsUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json",
    );
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set("fields", "name,reviews,types,geometry");
    detailsUrl.searchParams.set("key", API_KEY);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = await detailsRes.json();

    if (detailsData.status !== "OK") {
      return NextResponse.json({ error: detailsData.status, reviews: [] });
    }

    const reviews = ((detailsData.result?.reviews || []) as PlaceReview[]).map(
      (review) => ({
        text: review.text || "",
        rating: review.rating || 0,
        authorName: review.author_name || "",
        relativeTimeDescription: review.relative_time_description || "",
      }),
    );

    return NextResponse.json({
      name: detailsData.result?.name,
      types: detailsData.result?.types || [],
      reviews,
    });
  } catch (error) {
    console.error("Place details fetch error:", error);
    return NextResponse.json({ error: "Fetch failed", reviews: [] });
  }
}
