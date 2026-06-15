import { describe, expect, test, vi } from "vitest";
import {
  createOutdoorPanoramaRequest,
  isWalkablePanoramaData,
} from "../src/engine/street-view-panorama-data";

describe("Street View walkable panorama filtering", () => {
  test("requires at least one outgoing pano link", () => {
    expect(
      isWalkablePanoramaData({
        links: [{ pano: "road-next", heading: 90, description: "road" }],
      }),
    ).toBe(true);

    expect(isWalkablePanoramaData({ links: [] })).toBe(false);
    expect(isWalkablePanoramaData({ links: undefined })).toBe(false);
  });

  test("coordinate searches are restricted to outdoor Street View sources", () => {
    const outdoor = Symbol("OUTDOOR");
    vi.stubGlobal("google", {
      maps: {
        StreetViewPreference: { NEAREST: "nearest" },
        StreetViewSource: { OUTDOOR: outdoor },
      },
    });

    expect(createOutdoorPanoramaRequest({ lat: 52.08, lng: 4.3 })).toEqual({
      location: { lat: 52.08, lng: 4.3 },
      preference: "nearest",
      radius: 120,
      sources: [outdoor],
    });

    vi.unstubAllGlobals();
  });
});
