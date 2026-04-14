import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";

export const runtime = "nodejs";

/** Booleans only — no secret values. */
export async function GET() {
  const mapsJs = Boolean(process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY);
  const geocoding = Boolean(process.env.GEOCODING_API_KEY);
  const places =
    Boolean(process.env.PLACES_API_KEY) || Boolean(process.env.GEOCODING_API_KEY);

  let databaseOk = false;
  try {
    getStats();
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  return NextResponse.json({
    ok: mapsJs && databaseOk,
    mapsJavascriptApiKeyConfigured: mapsJs,
    geocodingApiKeyConfigured: geocoding,
    placesApiKeyConfigured: places,
    databaseOk,
  });
}
