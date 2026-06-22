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

function assertClose(actual, expected, epsilon, message) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${message} Expected ${expected}, received ${actual}.`,
  );
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

assert(
  yaw === 12.1,
  "Yaw wiggle should retain the tuned 12.1 CSS transform default.",
);
assert(
  pitch === 1.8,
  "Pitch wiggle should retain the tuned 1.8 CSS transform default.",
);
assert(
  drift === 2.5,
  "Drift should retain the tuned 2.5 CSS animation default.",
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
const wanderY = Number.parseFloat(wanderStyle["--wander-float-y"]);
const wanderRotate = Number.parseFloat(wanderStyle["--wander-float-rotate"]);
const stoppedX = Number.parseFloat(stoppedTeleportStyle["--wander-float-x"]);
const stoppedY = Number.parseFloat(stoppedTeleportStyle["--wander-float-y"]);
const stoppedRotate = Number.parseFloat(
  stoppedTeleportStyle["--wander-float-rotate"],
);
const durationSec = Number.parseFloat(wanderStyle.animation.split(" ")[1]);
const defaultScale = Number.parseFloat(wanderStyle["--wander-float-scale"]);
const stoppedScale = Number.parseFloat(
  stoppedTeleportStyle["--wander-float-scale"],
);
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

const keyframeCoefficients = [
  { position: "0/100", x: 0, y: 0, rotate: 0 },
  { position: "24", x: 1, y: -0.45, rotate: 1 },
  { position: "52", x: -0.72, y: 1, rotate: -0.65 },
  { position: "78", x: 0.34, y: 0.5, rotate: 0.45 },
];

function assertOverscanContains(
  styleName,
  width,
  height,
  xAmplitude,
  yAmplitude,
  rotateAmplitude,
  scale,
) {
  for (const keyframe of keyframeCoefficients) {
    const radians = Math.abs(
      (keyframe.rotate * rotateAmplitude * Math.PI) / 180,
    );
    const projectedHalfWidth =
      (width * Math.cos(radians) + height * Math.abs(Math.sin(radians))) / 2;
    const projectedHalfHeight =
      (height * Math.cos(radians) + width * Math.abs(Math.sin(radians))) / 2;
    const coveredHalfWidth =
      scale * (projectedHalfWidth - Math.abs(keyframe.x * xAmplitude));
    const coveredHalfHeight =
      scale * (projectedHalfHeight - Math.abs(keyframe.y * yAmplitude));

    assert(
      coveredHalfWidth + 0.0001 >= width / 2,
      `${styleName} keyframe ${keyframe.position}% leaves horizontal exposure at ${width}x${height}: covers ${coveredHalfWidth.toFixed(4)}, needs ${(width / 2).toFixed(4)}.`,
    );
    assert(
      coveredHalfHeight + 0.0001 >= height / 2,
      `${styleName} keyframe ${keyframe.position}% leaves vertical exposure at ${width}x${height}: covers ${coveredHalfHeight.toFixed(4)}, needs ${(height / 2).toFixed(4)}.`,
    );
  }
}

for (const state of Object.values(BotState)) {
  const stateStyle = getStreetViewEffectStyle(state, "none", defaultSettings);
  assert(
    stateStyle.animation !== "none",
    `Street View breathing should remain enabled in ${state}.`,
  );
}
assert(
  stoppedTeleportStyle.animation !== "none",
  "Street View breathing should remain enabled during teleport.",
);
assert(
  stoppedX > 0 && stoppedX < wanderX,
  "Stopped Street View breathing should be numerically quieter than WANDER.",
);
assertClose(wanderX, 12.1 * 3.8, 0.005, "WANDER horizontal motion changed.");
assertClose(stoppedX, 12.1 * 3.8 * 0.61, 0.005, "Stopped horizontal motion changed.");
assertClose(wanderY, 18, 0.005, "WANDER vertical motion changed.");
assertClose(stoppedY, 18 * 0.61, 0.005, "Stopped vertical motion changed.");
assertClose(wanderRotate, 12.1 * 0.075, 0.001, "WANDER rotation changed.");
assertClose(
  stoppedRotate,
  12.1 * 0.075 * 0.61,
  0.001,
  "Stopped rotation changed.",
);
assert(durationSec === 4, "The irregular CSS keyframe cycle should last exactly four seconds.");
assert(cappedX === 54, "Capped horizontal motion should remain exactly 54px.");
assert(cappedY === 28, "Capped vertical motion should remain exactly 28px.");
assert(cappedRotate === 1.05, "Capped rotation should remain exactly 1.05deg.");
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
  assertOverscanContains(
    "Default WANDER",
    width,
    height,
    wanderX,
    wanderY,
    wanderRotate,
    defaultScale,
  );
  assertOverscanContains(
    "Default stopped",
    width,
    height,
    stoppedX,
    stoppedY,
    stoppedRotate,
    stoppedScale,
  );
  assertOverscanContains(
    "Capped WANDER",
    width,
    height,
    cappedX,
    cappedY,
    cappedRotate,
    cappedScale,
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
