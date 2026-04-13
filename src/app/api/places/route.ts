import { NextRequest, NextResponse } from "next/server";

const API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

type NearbyPlace = {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
};

type PlaceReview = {
  text?: string;
  rating?: number;
  author_name?: string;
  relative_time_description?: string;
};

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Google API key not configured", places: [] });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") || "200";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required", places: [] }, { status: 400 });
  }

  try {
    const nearbyUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
    );
    nearbyUrl.searchParams.set("location", `${lat},${lng}`);
    nearbyUrl.searchParams.set("radius", radius);
    nearbyUrl.searchParams.set("type", "establishment");
    nearbyUrl.searchParams.set("key", API_KEY);

    const nearbyRes = await fetch(nearbyUrl.toString());
    const nearbyData = await nearbyRes.json();

    if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
      console.error(
        "Places API error:",
        nearbyData.status,
        nearbyData.error_message,
      );
      return NextResponse.json({ error: nearbyData.status, places: [] });
    }

    const places = ((nearbyData.results || []) as NearbyPlace[]).map((place) => ({
      placeId: place.place_id,
      name: place.name,
      location: {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
      },
      types: place.types || [],
      rating: place.rating,
      totalRatings: place.user_ratings_total,
    }));

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Places fetch error:", error);
    return NextResponse.json({ error: "Fetch failed", places: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Google API key not configured", reviews: [] });
  }

  try {
    const { placeId } = (await request.json()) as { placeId?: string };

    if (!placeId) {
      return NextResponse.json({ error: "placeId required", reviews: [] }, { status: 400 });
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
    return NextResponse.json({ error: "Fetch failed", reviews: [] }, { status: 500 });
  }
}
