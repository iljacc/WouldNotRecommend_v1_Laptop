import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Fixed installation label for the Den Haag kiosk region.
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

  return NextResponse.json({
    city: "The Hague",
    country: "Netherlands",
    lookupStatus: "FIXED",
  });
}
