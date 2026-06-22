import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { HUD } from "@/components/HUD";
import { ModeIndicator } from "@/components/ModeIndicator";
import { ModePulseGlyph } from "@/components/ModePulseGlyph";
import { BotState, stateToMode } from "@/lib/types";

const globalCss = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function renderHud(state: BotState) {
  return renderToStaticMarkup(
    createElement(HUD, {
      mode: stateToMode(state),
      botState: state,
      coords: { lat: 52.0705, lng: 4.3007 },
      city: "The Hague",
      reviewsToday: 0,
      lifetimeReviewsTotal: 0,
      sessionStartTime: 0,
      subtitle: null,
      cityTourSegmentEndTime: 0,
      nextCityLabel: "",
      cityTourActive: false,
      scheduledCityTeleportUi: false,
    }),
  );
}

describe("rainbow processing indicator", () => {
  test("DELIVER cycles the group containing a current-color glyph and visible Processing label", () => {
    const markup = renderHud(BotState.DELIVER);

    expect(markup).toMatch(
      /class="flex items-center gap-2\.5 processing-rainbow-cycle"[\s\S]*?aria-hidden="true" data-mode-pulse-glyph="true" class="[^"]*text-current[^"]*"[\s\S]*?class="[^"]*text-current[^"]*opacity-100[^"]*">Processing<\/span>/,
    );
  });

  test("pastel rainbow cycles once per second and reduced motion disables its glyph pulse", () => {
    for (const color of ["#fde68a", "#f9a8d4", "#c4b5fd", "#93c5fd", "#86efac", "#fdba74"]) {
      expect(globalCss).toContain(color);
    }
    expect(globalCss).toMatch(/\.processing-rainbow-cycle\s*\{[\s\S]*?animation:\s*processing-rainbow-cycle 1s linear infinite/);
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.processing-rainbow-cycle\s*\{[\s\S]*?animation:\s*none[\s\S]*?color:\s*#c4b5fd[\s\S]*?\.processing-rainbow-cycle \[data-mode-pulse-glyph\]\s*\{[\s\S]*?animation:\s*none !important/,
    );
    expect(globalCss).not.toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?^\s*\[data-mode-pulse-glyph\]\s*\{/m,
    );
  });

  test.each([BotState.DETECT, BotState.RETURN])(
    "%s does not apply the rainbow cycle",
    (state) => {
      expect(renderHud(state)).not.toContain("processing-rainbow-cycle");
    },
  );

  test("ordinary Processing is yellow", () => {
    const markup = renderToStaticMarkup(
      createElement(ModeIndicator, {
        mode: "Processing",
        state: BotState.RETURN,
        showCityTourTeleport: false,
      }),
    );

    expect(markup).toMatch(
      /class="[^"]*text-yellow-400[^"]*opacity-100[^"]*">Processing<\/span>/,
    );
    expect(markup).not.toContain("text-current");
  });

  test("scheduled teleport indicator stays violet without complaint styling", () => {
    const markup = renderToStaticMarkup(
      createElement(ModeIndicator, {
        mode: "Processing",
        state: BotState.TELEPORT,
        showCityTourTeleport: true,
      }),
    );

    expect(markup).toContain("Teleporting");
    expect(markup).toContain("text-violet-400");
    expect(markup).not.toContain("processing-rainbow-cycle");
  });

  test("scheduled teleport glyph stays violet without complaint styling", () => {
    const markup = renderToStaticMarkup(
      createElement(ModePulseGlyph, {
        mode: "Processing",
        state: BotState.TELEPORT,
        cityTourTeleportBlink: true,
      }),
    );

    expect(markup).toContain("text-violet-400");
    expect(markup).not.toContain("text-current");
    expect(markup).not.toContain("processing-rainbow-cycle");
  });
});
