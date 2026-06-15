import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("src/app/api/geocode/route.ts", "utf8");

assert.match(routeSource, /city:\s*"The Hague"/);
assert.match(routeSource, /country:\s*"Netherlands"/);
assert.doesNotMatch(routeSource, /lookupCityCountryOffline/);
assert.doesNotMatch(routeSource, /offline-reverse-geocode/);

console.log("geocode fixed city route OK");
