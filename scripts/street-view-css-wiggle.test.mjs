import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const effects = readFileSync(join(root, "src/components/VisualEffects.tsx"), "utf8");
const botPage = readFileSync(join(root, "src/app/bot/page.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const BotState = {
  WANDER: "WANDER",
  DETECT: "DETECT",
  DELIVER: "DELIVER",
  RETURN: "RETURN",
  TELEPORT: "TELEPORT",
};
const grading = {
  brightness: 1,
  saturate: 1,
  hueRotate: 0,
};
const sideEffectCalls = {
  fetch: 0,
  setTimeout: 0,
  setInterval: 0,
  requestAnimationFrame: 0,
  XMLHttpRequest: 0,
  Image: 0,
  createImageBitmap: 0,
  google: 0,
};
const poison = (name) => () => {
  sideEffectCalls[name] += 1;
  throw new Error(`getStreetViewEffectStyle called ${name}`);
};
const compiledEffects = ts.transpileModule(effects, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const effectsModule = { exports: {} };
const requireEffectDependency = (id) => {
  if (id === "@/lib/config") {
    return {
      TIMING: { TELEPORT_FADE_OUT: 1, TELEPORT_FADE_IN: 1 },
      VISUAL: {
        COLOR_GRADING: Object.fromEntries(
          Object.values(BotState).map((state) => [state, grading]),
        ),
        COLOR_TRANSITION: 1,
      },
    };
  }
  if (id === "@/lib/types") return { BotState };
  if (id === "react/jsx-runtime") return { jsx: () => null };
  throw new Error(`Unexpected VisualEffects dependency: ${id}`);
};
const runtimeContext = {
  fetch: poison("fetch"),
  setTimeout: poison("setTimeout"),
  setInterval: poison("setInterval"),
  requestAnimationFrame: poison("requestAnimationFrame"),
  XMLHttpRequest: poison("XMLHttpRequest"),
  Image: poison("Image"),
  createImageBitmap: poison("createImageBitmap"),
};
Object.defineProperty(runtimeContext, "google", {
  get() {
    sideEffectCalls.google += 1;
    throw new Error("getStreetViewEffectStyle accessed google");
  },
});
runtimeContext.window = runtimeContext;
vm.runInNewContext(
  `(function (require, module, exports) { ${compiledEffects}\n})`,
  runtimeContext,
)(requireEffectDependency, effectsModule, effectsModule.exports);
const { getStreetViewEffectStyle } = effectsModule.exports;

assert(
  /WANDER_LOOK_FLOAT_ENABLED:\s*true/.test(config),
  "Street View wander wiggle should be enabled by default.",
);

const yaw = Number(config.match(/WANDER_LOOK_SWAY_DEG:\s*([0-9.]+)/)?.[1]);
const pitch = Number(
  config.match(/WANDER_LOOK_PITCH_SWAY_DEG:\s*([0-9.]+)/)?.[1],
);
const drift = Number(config.match(/WANDER_LOOK_DRIFT:\s*([0-9.]+)/)?.[1]);

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
  "VisualEffects.tsx must not explicitly call setPov.",
);
const defaultSettings = {
  wanderLookFloatEnabled: true,
  wanderLookSwayDeg: yaw,
  wanderLookPitchSwayDeg: pitch,
  wanderLookDrift: drift,
};
const wanderStyle = getStreetViewEffectStyle(
  BotState.WANDER,
  "none",
  defaultSettings,
);
const stoppedTeleportStyle = getStreetViewEffectStyle(
  BotState.DELIVER,
  "warp",
  defaultSettings,
);
const wanderX = Number.parseFloat(wanderStyle["--wander-float-x"]);
const stoppedX = Number.parseFloat(stoppedTeleportStyle["--wander-float-x"]);
const defaultScale = Number.parseFloat(wanderStyle["--wander-float-scale"]);
const cappedMotionStyle = getStreetViewEffectStyle(
  BotState.WANDER,
  "none",
  {
    ...defaultSettings,
    wanderLookSwayDeg: 100,
    wanderLookPitchSwayDeg: 100,
  },
);
const cappedX = Number.parseFloat(cappedMotionStyle["--wander-float-x"]);
const cappedY = Number.parseFloat(cappedMotionStyle["--wander-float-y"]);
const cappedRotate = Number.parseFloat(
  cappedMotionStyle["--wander-float-rotate"],
);
const cappedScale = Number.parseFloat(
  cappedMotionStyle["--wander-float-scale"],
);

function requiredScaleForViewport(width, height) {
  const radians = (cappedRotate * Math.PI) / 180;
  const rotatedWidth =
    width * Math.cos(radians) + height * Math.sin(radians);
  const rotatedHeight =
    height * Math.cos(radians) + width * Math.sin(radians);
  return Math.max(
    (rotatedWidth + 2 * cappedX) / width,
    (rotatedHeight + 2 * cappedY) / height,
  );
}

assert(
  stoppedTeleportStyle.animation !== "none",
  "Street View breathing should remain enabled outside WANDER and during teleport.",
);
assert(
  stoppedX > 0 && stoppedX < wanderX,
  "Stopped Street View breathing should be numerically quieter than WANDER.",
);
assert(
  defaultScale >= 1.03,
  "Default Street View breathing should retain safe overscan on small kiosk viewports.",
);
assert(
  cappedScale >= 1.15,
  "Capped Street View motion should retain at least 15% overscan.",
);
for (const [width, height] of [
  [1366, 768],
  [1024, 768],
  [1080, 1920],
]) {
  const requiredScale = requiredScaleForViewport(width, height);
  assert(
    cappedScale + 0.0001 >= requiredScale,
    `Capped overscan ${cappedScale} should cover ${width}x${height} (requires ${requiredScale.toFixed(4)}).`,
  );
}
assert(
  Object.values(sideEffectCalls).every((count) => count === 0),
  `Style computation must remain local-only: ${JSON.stringify(sideEffectCalls)}`,
);
assert(
  /className="[^"]*street-view-breathing[^"]*"/.test(botPage),
  "The transformed Street View wrapper should expose the breathing class.",
);
assert(
  /@keyframes\s+wander-look-float/.test(css),
  "CSS should define the local-only wander wiggle keyframes.",
);
const reducedMotionRule = css.match(
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.street-view-breathing\s*\{([\s\S]*?)\}\s*\}/,
)?.[1];
assert(reducedMotionRule, "CSS should define a reduced-motion breathing rule.");
assert(
  /animation:\s*none\s*!important/.test(reducedMotionRule),
  "Reduced motion should disable the breathing animation.",
);
assert(
  /transform:\s*scale\(1\)\s*!important/.test(reducedMotionRule),
  "Reduced motion should reset the breathing transform.",
);
assert(
  /transition:\s*none\s*!important/.test(reducedMotionRule),
  "Reduced motion should disable the inline transform transition.",
);
