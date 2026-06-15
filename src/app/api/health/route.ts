import { NextResponse } from "next/server";
import { getReviewCorpusStats, getStats } from "@/lib/db";

export const runtime = "nodejs";

/** Booleans only — no secret values. */
export async function GET() {
  const mapsJs = Boolean(process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY);

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
    ok: mapsJs && databaseOk && reviewCorpus.places > 0 && reviewCorpus.reviews > 0,
    mapsJavascriptApiKeyConfigured: mapsJs,
    reviewSource: "local",
    reviewCorpus,
    databaseOk,
  });
}
