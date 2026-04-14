import { NextRequest, NextResponse } from "next/server";
import { lookupCityCountryOffline } from "@/lib/offline-reverse-geocode";

export const runtime = "nodejs";

/**
 * Reverse-geocode client-supplied lat/lng (bot spawn) using bundled GeoNames data —
 * no Google or other remote geocoding APIs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({
      city: "Unknown",
      country: null,
      lookupStatus: "INVALID_PARAMS",
    });
  }

  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return NextResponse.json({
      city: "Unknown",
      country: null,
      lookupStatus: "INVALID_PARAMS",
    });
  }

  try {
    const hit = await lookupCityCountryOffline(latN, lngN);
    if (!hit) {
      return NextResponse.json({
        city: "Unknown",
        country: null,
        lookupStatus: "EMPTY",
      });
    }

    const display = `${hit.city}, ${hit.country}`;
    return NextResponse.json({
      city: display,
      country: hit.country,
      lookupStatus: "OK",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Offline geocode error:", error);
    return NextResponse.json({
      city: "Unknown",
      country: null,
      lookupStatus: "ERROR",
      ...(process.env.NODE_ENV === "development" ? { detail: message } : {}),
    });
  }
}
