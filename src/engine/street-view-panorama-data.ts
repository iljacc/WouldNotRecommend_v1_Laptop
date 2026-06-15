"use client";

import type { LatLng } from "@/lib/types";

const OUTDOOR_PANORAMA_RADIUS_METERS = 120;

export function isWalkablePanoramaData(
  data: Pick<google.maps.StreetViewPanoramaData, "links"> | null | undefined,
): boolean {
  return (
    data?.links?.some((link) => Boolean(link?.pano)) ?? false
  );
}

export function createOutdoorPanoramaRequest(
  location: LatLng,
): google.maps.StreetViewLocationRequest {
  return {
    location,
    preference: google.maps.StreetViewPreference.NEAREST,
    radius: OUTDOOR_PANORAMA_RADIUS_METERS,
    sources: [google.maps.StreetViewSource.OUTDOOR],
  };
}

export async function getWalkableOutdoorPanorama(
  service: google.maps.StreetViewService,
  location: LatLng,
): Promise<google.maps.StreetViewPanoramaData | null> {
  try {
    const response = await service.getPanorama(
      createOutdoorPanoramaRequest(location),
    );
    return isWalkablePanoramaData(response.data) ? response.data : null;
  } catch {
    return null;
  }
}

export async function getWalkablePanoramaById(
  service: google.maps.StreetViewService,
  pano: string,
): Promise<google.maps.StreetViewPanoramaData | null> {
  try {
    const response = await service.getPanorama({ pano });
    return isWalkablePanoramaData(response.data) ? response.data : null;
  } catch {
    return null;
  }
}
