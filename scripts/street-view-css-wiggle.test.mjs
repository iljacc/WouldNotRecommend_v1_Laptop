import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const effects = readFileSync(join(root, "src/components/VisualEffects.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  /WANDER_LOOK_FLOAT_ENABLED:\s*true/.test(config),
  "Street View wander wiggle should be enabled by default.",
);

const yaw = Number(config.match(/WANDER_LOOK_SWAY_DEG:\s*([0-9.]+)/)?.[1]);
const pitch = Number(
  config.match(/WANDER_LOOK_PITCH_SWAY_DEG:\s*([0-9.]+)/)?.[1],
);

assert(Number.isFinite(yaw) && yaw > 0 && yaw <= 2, "Yaw wiggle should stay very slight.");
assert(
  Number.isFinite(pitch) && pitch > 0 && pitch <= 0.5,
  "Pitch wiggle should stay very slight.",
);

assert(
  effects.includes("wander-look-float"),
  "Street View visual effects should apply the CSS wiggle animation.",
);
assert(
  !effects.includes("setPov(") && !effects.includes(".setPov"),
  "CSS wiggle must not update the Google Street View POV.",
);
assert(
  /@keyframes\s+wander-look-float/.test(css),
  "CSS should define the local-only wander wiggle keyframes.",
);
