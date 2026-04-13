"use client";

import type { LatLng } from "@/lib/types";

interface Props {
  coords: LatLng;
}

export function Coordinates({ coords }: Props) {
  const latDir = coords.lat >= 0 ? "N" : "S";
  const lngDir = coords.lng >= 0 ? "E" : "W";
  const lat = Math.abs(coords.lat).toFixed(4);
  const lng = Math.abs(coords.lng).toFixed(4);

  return (
    <span className="text-xs text-white/60 tabular-nums">
      {lat}&deg; {latDir}, {lng}&deg; {lngDir}
    </span>
  );
}
