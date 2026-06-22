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
const hudSource = readFileSync(
  join(process.cwd(), "src/components/HUD.tsx"),
  "utf8",
);

function renderHud(
  state: BotState,
  stats = { reviewsToday: 0 as number | null, lifetimeReviewsTotal: 0 as number | null },
) {
  return renderToStaticMarkup(
    createElement(HUD, {
      mode: stateToMode(state),
      botState: state,
      coords: { lat: 52.0705, lng: 4.3007 },
      city: "The Hague",
      reviewsToday: stats.reviewsToday,
      lifetimeReviewsTotal: stats.lifetimeReviewsTotal,
      sessionStartTime: 0,
      subtitle: null,
      cityTourSegmentEndTime: 0,
      nextCityLabel: "",
      cityTourActive: false,
      scheduledCityTeleportUi: false,
    }),
  );
}

describe("original processing indicator", () => {
  test("DELIVER keeps the original green label and white glyph without a color-cycle class", () => {
    const markup = renderHud(BotState.DELIVER);

    expect(markup).not.toContain("processing-rainbow-cycle");
    expect(markup).toMatch(/aria-hidden="true" class="[^"]*text-white[^"]*"/);
    expect(markup).toMatch(/class="[^"]*text-green-400[^"]*opacity-100[^"]*">Processing<\/span>/);
  });

  test("rainbow processing styles are absent", () => {
    expect(globalCss).not.toContain("processing-rainbow-cycle");
  });

  test.each([BotState.DETECT, BotState.RETURN])(
    "%s does not apply the rainbow cycle",
    (state) => {
      expect(renderHud(state)).not.toContain("processing-rainbow-cycle");
    },
  );

  test("ordinary Processing is green", () => {
    const markup = renderToStaticMarkup(
      createElement(ModeIndicator, {
        mode: "Processing",
        showCityTourTeleport: false,
      }),
    );

    expect(markup).toMatch(
      /class="[^"]*text-green-400[^"]*opacity-100[^"]*">Processing<\/span>/,
    );
    expect(markup).not.toContain("text-current");
  });

  test("scheduled teleport indicator stays violet without complaint styling", () => {
    const markup = renderToStaticMarkup(
      createElement(ModeIndicator, {
        mode: "Processing",
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

describe("review counter celebration", () => {
  test("HUD re-keys the counter from the displayed totals", () => {
    expect(hudSource).toMatch(/key=\{`review-stats-\$\{reviewsToday\}-\$\{lifetimeReviewsTotal\}`\}/);
    expect(hudSource).toMatch(/celebrate=\{reviewsToday !== null && lifetimeReviewsTotal !== null\}/);
    expect(hudSource).not.toContain("reviewCount");
  });

  test("loaded or updated totals render six accessible-hidden sparkles and a shimmer", () => {
    const initialMarkup = renderHud(BotState.WANDER, {
      reviewsToday: null,
      lifetimeReviewsTotal: null,
    });
    const incrementMarkup = renderHud(BotState.RETURN, {
      reviewsToday: 4,
      lifetimeReviewsTotal: 120,
    });

    expect(initialMarkup).not.toContain("review-counter-celebration");
    expect(incrementMarkup).toContain('class="review-counter-celebration"');
    expect(incrementMarkup.match(/data-review-sparkle="true"/g)).toHaveLength(6);
    expect(incrementMarkup).toMatch(/aria-hidden="true"[\s\S]*?review-counter-shimmer-clip[\s\S]*?review-counter-shimmer/);
  });

  test("sparkles and shimmer run for 900ms and respect reduced motion", () => {
    expect(globalCss).toMatch(/\.review-counter-sparkle\s*\{[\s\S]*?animation:\s*review-counter-sparkle 900ms/);
    expect(globalCss).toMatch(/\.review-counter-shimmer\s*\{[\s\S]*?animation:\s*review-counter-shimmer 900ms/);
    expect(globalCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.review-counter-sparkle,[\s\S]*?\.review-counter-shimmer\s*\{[\s\S]*?animation:\s*none !important/);
  });
});
