"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomSpawnPoint, WanderRegion } from "@/lib/bot-settings";
import { wanderRegionFromPolygonPath, wanderRegionFromBBox } from "@/lib/bot-settings";

type Props = {
  wanderRegion: WanderRegion;
  onWanderRegionChange: (r: WanderRegion) => void;
  spawnPoints: CustomSpawnPoint[];
  onSpawnPointsChange: (points: CustomSpawnPoint[]) => void;
  spawnPlacementEnabled: boolean;
};

function regionSignature(r: WanderRegion): string {
  return JSON.stringify({
    minLat: r.minLat,
    maxLat: r.maxLat,
    minLng: r.minLng,
    maxLng: r.maxLng,
    path: r.polygonPath ?? null,
  });
}

function centerOfRegion(r: WanderRegion): google.maps.LatLngLiteral {
  return {
    lat: (r.minLat + r.maxLat) / 2,
    lng: (r.minLng + r.maxLng) / 2,
  };
}

export default function AdminRegionMap({
  wanderRegion,
  onWanderRegionChange,
  spawnPoints,
  onSpawnPointsChange,
  spawnPlacementEnabled,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const lastEmittedSig = useRef<string>("");
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const spawnPointsRef = useRef(spawnPoints);
  spawnPointsRef.current = spawnPoints;

  const clearPathListeners = () => {
    for (const l of pathListenersRef.current) {
      l.remove();
    }
    pathListenersRef.current = [];
  };

  const attachPolygonPathListeners = useCallback(
    (poly: google.maps.Polygon) => {
      clearPathListeners();
      const path = poly.getPath();
      const push = () => {
        const pts: { lat: number; lng: number }[] = [];
        path.forEach((ll) => pts.push({ lat: ll.lat(), lng: ll.lng() }));
        if (pts.length < 3) return;
        const next = wanderRegionFromPolygonPath(pts);
        const sig = regionSignature(next);
        lastEmittedSig.current = sig;
        onWanderRegionChange(next);
      };
      ["set_at", "insert_at", "remove_at"].forEach((evt) => {
        pathListenersRef.current.push(
          google.maps.event.addListener(path, evt as "set_at", push),
        );
      });
    },
    [onWanderRegionChange],
  );

  const clearOverlays = useCallback(() => {
    clearPathListeners();
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    if (rectangleRef.current) {
      rectangleRef.current.setMap(null);
      rectangleRef.current = null;
    }
  }, []);

  const drawRegionOnMap = useCallback(
    (region: WanderRegion) => {
      const map = mapRef.current;
      if (!map) return;
      clearOverlays();

      const path = region.polygonPath;
      if (path && path.length >= 3) {
        const poly = new google.maps.Polygon({
          map,
          paths: path,
          editable: true,
          draggable: true,
          strokeColor: "#7cb083",
          strokeOpacity: 1,
          strokeWeight: 2,
          fillColor: "#7cb083",
          fillOpacity: 0.18,
        });
        polygonRef.current = poly;
        attachPolygonPathListeners(poly);
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 48);
        return;
      }

      const rect = new google.maps.Rectangle({
        map,
        bounds: {
          north: region.maxLat,
          south: region.minLat,
          east: region.maxLng,
          west: region.minLng,
        },
        editable: false,
        draggable: false,
        strokeColor: "#6d7a66",
        strokeOpacity: 0.9,
        strokeWeight: 1,
        fillColor: "#6d7a66",
        fillOpacity: 0.06,
      });
      rectangleRef.current = rect;
      map.fitBounds(
        {
          north: region.maxLat,
          south: region.minLat,
          east: region.maxLng,
          west: region.minLng,
        },
        48,
      );
    },
    [attachPolygonPathListeners, clearOverlays],
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
        await loader.importLibrary("drawing");
        if (cancelled || !containerRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: centerOfRegion(wanderRegion),
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;

        const dm = new google.maps.drawing.DrawingManager({
          drawingMode: null,
          drawingControl: true,
          drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON],
          },
          polygonOptions: {
            editable: true,
            draggable: true,
            strokeColor: "#7cb083",
            fillColor: "#7cb083",
            fillOpacity: 0.18,
            strokeWeight: 2,
          },
        });
        dm.setMap(map);
        drawingManagerRef.current = dm;

        google.maps.event.addListener(dm, "overlaycomplete", (e: google.maps.drawing.OverlayCompleteEvent) => {
          if (e.type !== google.maps.drawing.OverlayType.POLYGON) return;
          clearOverlays();
          const poly = e.overlay as google.maps.Polygon;
          poly.setEditable(true);
          poly.setDraggable(true);
          polygonRef.current = poly;
          dm.setDrawingMode(null);

          const pts: { lat: number; lng: number }[] = [];
          poly.getPath().forEach((ll) => pts.push({ lat: ll.lat(), lng: ll.lng() }));
          const next = wanderRegionFromPolygonPath(pts);
          lastEmittedSig.current = regionSignature(next);
          onWanderRegionChange(next);
          attachPolygonPathListeners(poly);
        });

        lastEmittedSig.current = regionSignature(wanderRegion);
        drawRegionOnMap(wanderRegion);
        setMapReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load Google Maps.");
      }
    })();

    return () => {
      cancelled = true;
      clickListenerRef.current?.remove();
      clickListenerRef.current = null;
      clearPathListeners();
      drawingManagerRef.current?.setMap(null);
      drawingManagerRef.current = null;
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      rectangleRef.current?.setMap(null);
      rectangleRef.current = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Map of google.maps.Marker instances, not React DOM
      const markers = markersRef.current;
      for (const m of markers.values()) {
        m.setMap(null);
      }
      markers.clear();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; region applied via effect below
  }, []);

  const regionSig = regionSignature(wanderRegion);
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (regionSig === lastEmittedSig.current) return;
    lastEmittedSig.current = regionSig;
    drawRegionOnMap(wanderRegion);
  }, [mapReady, regionSig, wanderRegion, drawRegionOnMap]);

  useEffect(() => {
    const map = mapRef.current;
    clickListenerRef.current?.remove();
    clickListenerRef.current = null;
    if (!map || !mapReady) return;
    if (!spawnPlacementEnabled) return;
    clickListenerRef.current = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `spawn-${Date.now()}`;
      onSpawnPointsChange([
        ...spawnPointsRef.current,
        { id, lat: e.latLng.lat(), lng: e.latLng.lng() },
      ]);
    });
    return () => {
      clickListenerRef.current?.remove();
      clickListenerRef.current = null;
    };
  }, [spawnPlacementEnabled, mapReady, onSpawnPointsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    for (const [id, marker] of markersRef.current) {
      if (!spawnPoints.some((s) => s.id === id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    for (const s of spawnPoints) {
      if (markersRef.current.has(s.id)) continue;
      const marker = new google.maps.Marker({
        map,
        position: { lat: s.lat, lng: s.lng },
        label: "S",
        title: s.label ?? `Spawn ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`,
      });
      markersRef.current.set(s.id, marker);
    }
  }, [spawnPoints, mapReady]);

  const clearPolygon = () => {
    const r = wanderRegion;
    const next = wanderRegionFromBBox(r.minLat, r.maxLat, r.minLng, r.maxLng);
    lastEmittedSig.current = regionSignature(next);
    onWanderRegionChange(next);
    drawRegionOnMap(next);
  };

  if (error) {
    return (
      <div className="rounded border border-[#5a3030] bg-[#1a1510] p-3 text-xs text-amber-200/90">
        Map: {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-[min(420px,55vh)] w-full rounded border border-[#2a3328] bg-[#0e100e]"
      />
      <p className="text-xs text-[#5a6658]">
        Draw a polygon with the toolbar, or drag vertices. Bounding-box mode uses the numeric fields
        below when no polygon is set.{" "}
        {spawnPlacementEnabled ? (
          <span className="text-[#8fbc8f]">Click the map to add spawn markers.</span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clearPolygon}
          className="rounded border border-[#2a3328] px-3 py-1.5 text-xs text-[#9faa8f] hover:bg-[#1a1e18]"
        >
          Clear polygon (bbox only)
        </button>
      </div>
    </div>
  );
}
