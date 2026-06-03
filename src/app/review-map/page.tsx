"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { useEffect, useMemo, useRef, useState } from "react";
import destinations from "../../../data/teleport-destinations.json";
import {
  createDefaultBotSettings,
  getBotSettings,
  isLatLngInWanderRegion,
  type BotSettings,
  type WanderRegion,
} from "@/lib/bot-settings";
import type { LatLng } from "@/lib/types";

type ReviewMapPlace = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  reviewCount: number;
  oneStarReviewCount: number;
  source: string;
  sourceUrl: string;
};

type ReviewMapResponse = {
  places?: ReviewMapPlace[];
  defaults?: {
    wanderRegion: WanderRegion;
    searchRadius: number;
    detectionRadius: number;
    targetRating: number;
  };
  error?: string;
};

function centerOfRegion(region: WanderRegion): LatLng {
  return {
    lat: (region.minLat + region.maxLat) / 2,
    lng: (region.minLng + region.maxLng) / 2,
  };
}

function regionPath(region: WanderRegion): LatLng[] {
  if (region.polygonPath && region.polygonPath.length >= 3) {
    return region.polygonPath;
  }

  return [
    { lat: region.minLat, lng: region.minLng },
    { lat: region.minLat, lng: region.maxLng },
    { lat: region.maxLat, lng: region.maxLng },
    { lat: region.maxLat, lng: region.minLng },
  ];
}

function fitBoundsFor(
  map: google.maps.Map,
  region: WanderRegion,
  places: ReviewMapPlace[],
  spawns: LatLng[],
) {
  const bounds = new google.maps.LatLngBounds();
  regionPath(region).forEach((point) => bounds.extend(point));
  places.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lng }));
  spawns.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 56);
}

function spawnPointsFromSettings(settings: BotSettings): (LatLng & { label: string })[] {
  const custom = settings.customSpawnPoints.filter((point) =>
    isLatLngInWanderRegion(point, settings.wanderRegion),
  );

  if (custom.length > 0) {
    return custom.map((point, index) => ({
      lat: point.lat,
      lng: point.lng,
      label: point.label || `Custom spawn ${index + 1}`,
    }));
  }

  return destinations
    .filter((point) => isLatLngInWanderRegion(point, settings.wanderRegion))
    .map((point) => ({
      lat: point.lat,
      lng: point.lng,
      label: point.label,
    }));
}

export default function ReviewMapPage() {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayCleanup = useRef<(() => void)[]>([]);
  const [places, setPlaces] = useState<ReviewMapPlace[]>([]);
  const [settings, setSettings] = useState<BotSettings>(() => createDefaultBotSettings());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReviewMapPlace | null>(null);

  useEffect(() => {
    setSettings(getBotSettings());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/review-map");
        const data = (await res.json()) as ReviewMapResponse;
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Failed to load review map data.");
        setPlaces(data.places || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load review map data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const spawns = useMemo(() => spawnPointsFromSettings(settings), [settings]);
  const placesInRegion = useMemo(
    () => places.filter((place) => isLatLngInWanderRegion(place, settings.wanderRegion)),
    [places, settings.wanderRegion],
  );
  const reviewCountInRegion = useMemo(
    () => placesInRegion.reduce((total, place) => total + place.oneStarReviewCount, 0),
    [placesInRegion],
  );
  const maxReviewCount = useMemo(
    () => Math.max(1, ...places.map((place) => place.oneStarReviewCount)),
    [places],
  );

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY;
    if (!apiKey) {
      setError("NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY is not set.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const loader = new Loader({ apiKey, version: "weekly" });
        await loader.importLibrary("maps");
        await loader.importLibrary("marker");
        if (cancelled || !mapElement.current) return;

        mapRef.current = new google.maps.Map(mapElement.current, {
          center: centerOfRegion(settings.wanderRegion),
          zoom: 15,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: true,
          streetViewControl: false,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load Google Maps.");
      }
    })();

    return () => {
      cancelled = true;
      overlayCleanup.current.forEach((cleanup) => cleanup());
      overlayCleanup.current = [];
      mapRef.current = null;
    };
  }, [settings.wanderRegion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    overlayCleanup.current.forEach((cleanup) => cleanup());
    overlayCleanup.current = [];

    const region = new google.maps.Polygon({
      map,
      paths: regionPath(settings.wanderRegion),
      strokeColor: "#9ae6b4",
      strokeOpacity: 0.96,
      strokeWeight: 3,
      fillColor: "#9ae6b4",
      fillOpacity: 0.08,
    });
    overlayCleanup.current.push(() => region.setMap(null));

    const center = centerOfRegion(settings.wanderRegion);
    const searchCircle = new google.maps.Circle({
      map,
      center,
      radius: settings.places.searchRadius,
      strokeColor: "#f8c471",
      strokeOpacity: 0.55,
      strokeWeight: 1,
      fillOpacity: 0,
    });
    overlayCleanup.current.push(() => searchCircle.setMap(null));

    for (const place of places) {
      const inRegion = isLatLngInWanderRegion(place, settings.wanderRegion);
      const weight = place.oneStarReviewCount / maxReviewCount;
      const circle = new google.maps.Circle({
        map,
        center: { lat: place.lat, lng: place.lng },
        radius: 16 + Math.sqrt(place.oneStarReviewCount) * 10,
        strokeColor: inRegion ? "#ff7a3d" : "#8b8f9a",
        strokeOpacity: inRegion ? 0.92 : 0.35,
        strokeWeight: inRegion ? 1.5 : 1,
        fillColor: inRegion ? "#ff4d2e" : "#7a7f8c",
        fillOpacity: inRegion ? 0.2 + weight * 0.42 : 0.12,
        clickable: true,
      });
      circle.addListener("click", () => setSelected(place));
      overlayCleanup.current.push(() => circle.setMap(null));
    }

    if (spawns.length > 0) {
      const path = new google.maps.Polyline({
        map,
        path: spawns,
        geodesic: true,
        strokeColor: "#64b5f6",
        strokeOpacity: 0.8,
        strokeWeight: 2,
      });
      overlayCleanup.current.push(() => path.setMap(null));
    }

    spawns.forEach((spawn, index) => {
      const marker = new google.maps.Marker({
        map,
        position: spawn,
        label: String(index + 1),
        title: spawn.label,
      });
      overlayCleanup.current.push(() => marker.setMap(null));
    });

    fitBoundsFor(map, settings.wanderRegion, placesInRegion, spawns);
  }, [loading, maxReviewCount, places, placesInRegion, settings, spawns]);

  return (
    <main className="min-h-screen bg-[#060807] text-[#e8ece0]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative min-h-[62vh] lg:min-h-screen">
          <div ref={mapElement} className="absolute inset-0 bg-[#101310]" />
          {loading ? (
            <div className="absolute left-4 top-4 rounded border border-[#2a3328] bg-[#0a0c0a]/90 px-3 py-2 text-xs text-[#9faa8f]">
              Loading review map...
            </div>
          ) : null}
          {error ? (
            <div className="absolute left-4 top-4 max-w-sm rounded border border-[#5a3030] bg-[#1a1510]/95 px-3 py-2 text-xs text-amber-200">
              {error}
            </div>
          ) : null}
        </section>

        <aside className="border-t border-[#253026] bg-[#0a0c0a] p-4 font-mono text-xs lg:border-l lg:border-t-0">
          <h1 className="text-base text-[#f2f4ea]">Review cluster map</h1>
          <p className="mt-2 text-[#788572]">
            Orange circles are local one-star review places. Larger, brighter circles have more
            one-star reviews. The green outline is the bot wander area; blue numbers are spawn or
            teleport starting positions.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="border border-[#253026] bg-[#0f130f] p-3">
              <dt className="text-[#687464]">Corpus places</dt>
              <dd className="mt-1 text-lg text-[#f2f4ea]">{places.length}</dd>
            </div>
            <div className="border border-[#253026] bg-[#0f130f] p-3">
              <dt className="text-[#687464]">In bot area</dt>
              <dd className="mt-1 text-lg text-[#f2f4ea]">{placesInRegion.length}</dd>
            </div>
            <div className="border border-[#253026] bg-[#0f130f] p-3">
              <dt className="text-[#687464]">1-star in area</dt>
              <dd className="mt-1 text-lg text-[#f2f4ea]">{reviewCountInRegion}</dd>
            </div>
            <div className="border border-[#253026] bg-[#0f130f] p-3">
              <dt className="text-[#687464]">Starts shown</dt>
              <dd className="mt-1 text-lg text-[#f2f4ea]">{spawns.length}</dd>
            </div>
          </dl>

          <div className="mt-5 border border-[#253026] bg-[#0f130f] p-3 text-[#aeb9a8]">
            <div>Search radius: {settings.places.searchRadius} m</div>
            <div>Detection radius: {settings.places.detectionRadius} m</div>
            <div>Target rating: {settings.reviews.targetRating} star</div>
          </div>

          <section className="mt-5">
            <h2 className="text-[11px] uppercase tracking-wide text-[#687464]">
              Selected place
            </h2>
            {selected ? (
              <div className="mt-2 space-y-2 text-[#cbd6c5]">
                <div className="text-sm text-[#f2f4ea]">{selected.name}</div>
                <div>
                  {selected.oneStarReviewCount} one-star review
                  {selected.oneStarReviewCount === 1 ? "" : "s"}
                </div>
                <div>
                  {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                </div>
                {selected.sourceUrl ? (
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[#8ec5ff] underline-offset-4 hover:underline"
                  >
                    Open source place
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[#687464]">Click a review circle on the map.</p>
            )}
          </section>

          <section className="mt-5">
            <h2 className="text-[11px] uppercase tracking-wide text-[#687464]">
              Spawn positions
            </h2>
            {spawns.length > 0 ? (
              <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[#aeb9a8]">
                {spawns.map((spawn, index) => (
                  <li key={`${spawn.lat}:${spawn.lng}`}>
                    {index + 1}. {spawn.label} ({spawn.lat.toFixed(5)}, {spawn.lng.toFixed(5)})
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[#687464]">
                No saved custom spawns or default teleport destinations inside this area.
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
