/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseBounds,
  selectPresentationBounds,
} = require("./windows-monitor-layout.cjs");

const fallback = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 1920, y: 0, width: 1920, height: 1080 },
];

const expectedMonitors = [
  { deviceName: "Samsung", x: -1920, y: 540, width: 1920, height: 1080, primary: false },
  { deviceName: "TCL", x: 0, y: 0, width: 3840, height: 2160, primary: true },
];

test("maps bot to primary 4K and terminal to left 1080p display", () => {
  const result = selectPresentationBounds(["/bot", "/terminal"], expectedMonitors, null, fallback);
  assert.equal(result.source, "detected");
  assert.deepEqual(result.bounds, [
    { x: 0, y: 0, width: 3840, height: 2160 },
    { x: -1920, y: 540, width: 1920, height: 1080 },
  ]);
});

test("monitor enumeration order does not affect route assignment", () => {
  const result = selectPresentationBounds(["/terminal", "/bot"], [...expectedMonitors].reverse(), null, fallback);
  assert.deepEqual(result.bounds, [
    { x: -1920, y: 540, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 3840, height: 2160 },
  ]);
});

test("explicit bounds override monitor detection", () => {
  const override = parseBounds("10,20,100,200;-300,40,500,600");
  const result = selectPresentationBounds(["/bot", "/terminal"], expectedMonitors, override, fallback);
  assert.equal(result.source, "override");
  assert.deepEqual(result.bounds, override);
});

test("ambiguous topology uses fallback instead of guessing", () => {
  const monitors = [
    { deviceName: "A", x: 0, y: 0, width: 1920, height: 1080, primary: true },
    { deviceName: "B", x: 1920, y: 0, width: 1920, height: 1080, primary: false },
  ];
  const result = selectPresentationBounds(["/bot", "/terminal"], monitors, null, fallback);
  assert.equal(result.source, "fallback");
  assert.match(result.warning, /primary 4K/i);
  assert.deepEqual(result.bounds, fallback);
});

test("invalid manual bounds produce a clear error", () => {
  assert.throws(() => parseBounds("0,0,1920"), /x,y,width,height/);
});
