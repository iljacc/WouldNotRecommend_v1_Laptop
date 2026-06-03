import { NextResponse } from "next/server";
import { getReviewCorpusStats, getStats } from "@/lib/db";

export const runtime = "nodejs";

/** Booleans only — no secret values. */
export async function GET() {
  const mapsJs = Boolean(process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY);
  const geocoding = Boolean(process.env.GEOCODING_API_KEY);
  const places =
    Boolean(process.env.PLACES_API_KEY) || Boolean(process.env.GEOCODING_API_KEY);
  const reviewSourceRaw = (process.env.REVIEW_SOURCE || "google").toLowerCase();
  const reviewSource =
    reviewSourceRaw === "local" ||
    reviewSourceRaw === "corpus" ||
    reviewSourceRaw === "sqlite"
      ? "local"
      : "google";

  let databaseOk = false;
  let reviewCorpus = { places: 0, reviews: 0 };
  try {
    getStats();
    reviewCorpus = getReviewCorpusStats();
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  return NextResponse.json({
    ok: mapsJs && databaseOk && (reviewSource === "local" || places),
    mapsJavascriptApiKeyConfigured: mapsJs,
    geocodingApiKeyConfigured: geocoding,
    placesApiKeyConfigured: places,
    reviewSource,
    reviewCorpus,
    databaseOk,
  });
}
