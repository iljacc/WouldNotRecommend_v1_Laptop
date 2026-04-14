"use client";

import type { LatLng } from "@/lib/types";
import { HudChip } from "./HudChip";

interface Props {
  coords: LatLng;
}

export function Coordinates({ coords }: Props) {
  const latDir = coords.lat >= 0 ? "N" : "S";
  const lngDir = coords.lng >= 0 ? "E" : "W";
  const lat = Math.abs(coords.lat).toFixed(6);
  const lng = Math.abs(coords.lng).toFixed(6);
  const title = `${coords.lat.toFixed(8)}, ${coords.lng.toFixed(8)}`;

  return (
    <HudChip>
      <span className="text-xs text-white/60 tabular-nums" title={title}>
        {lat}&deg; {latDir}, {lng}&deg; {lngDir}
      </span>
    </HudChip>
  );
}
