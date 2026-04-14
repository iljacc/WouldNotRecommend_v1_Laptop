import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GEOCODING_API_KEY;

type AddressComponent = {
  long_name: string;
  types: string[];
};

/** Prefer a human place name; order tuned for EU / NL and dense cities. */
const CITY_TYPE_PRIORITY = [
  "locality",
  "postal_town",
  "administrative_area_level_3",
  "administrative_area_level_2",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
  "administrative_area_level_1",
] as const;

function pickCityFromComponents(components: AddressComponent[]): string {
  for (const type of CITY_TYPE_PRIORITY) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit?.long_name) return hit.long_name;
  }
  return "";
}

function pickCountry(components: AddressComponent[]): string {
  const hit = components.find((c) => c.types.includes("country"));
  return hit?.long_name ?? "";
}

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({
      city: "Unknown",
      country: null,
      googleStatus: "MISSING_SERVER_KEY",
    });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({
      city: "Unknown",
      country: null,
      googleStatus: "INVALID_PARAMS",
    });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    /** Reverse-geocode the client-supplied point (bot spawn / Street View location), not the server. */
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("language", "en");
    /** Omit narrow result_type so Google can return full address results (avoids empty sets). */
    url.searchParams.set("key", API_KEY);

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status: string;
      results?: { address_components?: AddressComponent[]; formatted_address?: string }[];
    };

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({
        city: "Unknown",
        country: null,
        googleStatus: data.status,
      });
    }

    let city = "";
    let country = "";

    for (const result of data.results) {
      const components = result.address_components || [];
      if (!city) {
        city = pickCityFromComponents(components);
      }
      if (!country) {
        country = pickCountry(components);
      }
      if (city && country) break;
    }

    if (!city && data.results[0]?.formatted_address) {
      const first = data.results[0].formatted_address.split(",")[0]?.trim();
      if (first && first.length < 80) city = first;
    }

    const display =
      city && country ? `${city}, ${country}` : country || city || "Unknown";

    return NextResponse.json({
      city: display,
      country: country || null,
      googleStatus: "OK",
    });
  } catch (error) {
    console.error("Geocode error:", error);
    return NextResponse.json({
      city: "Unknown",
      country: null,
      googleStatus: "FETCH_ERROR",
    });
  }
}
