import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GEOCODING_API_KEY;

type AddressComponent = {
  long_name: string;
  types: string[];
};

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ city: "Unknown", country: null });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ city: "Unknown", country: null });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set(
      "result_type",
      "locality|administrative_area_level_1|country",
    );
    url.searchParams.set("key", API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ city: "Unknown", country: null });
    }

    let city = "";
    let country = "";

    for (const result of data.results as { address_components?: AddressComponent[] }[]) {
      for (const component of result.address_components || []) {
        if (component.types.includes("locality") && !city) {
          city = component.long_name;
        }
        if (component.types.includes("administrative_area_level_1") && !city) {
          city = component.long_name;
        }
        if (component.types.includes("country") && !country) {
          country = component.long_name;
        }
      }
      if (city && country) break;
    }

    const display = city && country ? `${city}, ${country}` : country || city || "Unknown";

    return NextResponse.json({ city: display, country: country || null });
  } catch (error) {
    console.error("Geocode error:", error);
    return NextResponse.json({ city: "Unknown", country: null });
  }
}
