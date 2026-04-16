import type { LatLng } from "@/lib/types";

/** Ray-casting point-in-polygon (WGS84; fine for city-scale regions). */
export function isLatLngInPolygon(point: LatLng, ring: LatLng[]): boolean {
  if (ring.length < 3) return false;
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect =
      (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function computeBBoxFromPath(path: LatLng[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of path) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat)) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Uniform random point inside a lat/lng axis-aligned box. */
export function randomLatLngInBBox(box: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): LatLng {
  return {
    lat: box.minLat + Math.random() * (box.maxLat - box.minLat),
    lng: box.minLng + Math.random() * (box.maxLng - box.minLng),
  };
}

/**
 * Random point a few dozen to a few hundred metres from `center` (flat-Earth approximation).
 */
export function randomLatLngOffsetMeters(
  center: LatLng,
  minMeters: number,
  maxMeters: number,
): LatLng {
  const bearing = Math.random() * Math.PI * 2;
  const distM =
    minMeters + Math.random() * (maxMeters - minMeters);
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLat = (distM * Math.cos(bearing)) / 111_320;
  const dLng =
    (distM * Math.sin(bearing)) /
    (111_320 * Math.max(0.15, Math.abs(cosLat)));
  return {
    lat: center.lat + dLat,
    lng: center.lng + dLng,
  };
}

/**
 * Uniform sample inside wander region (bbox, or rejection sample for polygon rings).
 */
export function randomLatLngInWanderRegion(region: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  polygonPath?: LatLng[];
}): LatLng {
  const path = region.polygonPath;
  if (path && path.length >= 3) {
    const box = computeBBoxFromPath(path);
    for (let i = 0; i < 50; i++) {
      const p = randomLatLngInBBox(box);
      if (isLatLngInPolygon(p, path)) return p;
    }
    const sumLat = path.reduce((s, q) => s + q.lat, 0);
    const sumLng = path.reduce((s, q) => s + q.lng, 0);
    return { lat: sumLat / path.length, lng: sumLng / path.length };
  }
  return randomLatLngInBBox(region);
}
