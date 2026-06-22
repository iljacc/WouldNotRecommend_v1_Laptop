import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifestPath = join(root, "src", "lib", "audio-assets.ts");

assert.ok(existsSync(manifestPath), "audio asset manifest should exist");

const manifest = readFileSync(manifestPath, "utf8");

function urlsFor(exportName) {
  const match = manifest.match(
    new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const`),
  );
  assert.ok(match, `missing ${exportName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

const ambientUrls = urlsFor("AMBIENT_AUDIO_URLS");
const footstepUrls = urlsFor("FOOTSTEP_AUDIO_URLS");

assert.equal(ambientUrls.length, 7, "manifest should contain seven unique ambiences");
assert.equal(footstepUrls.length, 12, "manifest should contain twelve step pairs");
assert.equal(new Set(ambientUrls).size, 7, "ambient URLs should be unique");

for (const url of [...ambientUrls, ...footstepUrls]) {
  assert.ok(!url.includes(" "), `URL should not contain spaces: ${url}`);
  assert.ok(!url.includes("(1)"), `URL should not contain duplicate suffix: ${url}`);
  assert.ok(
    existsSync(join(root, "public", ...url.split("/").filter(Boolean))),
    `generated asset should exist: ${url}`,
  );
}

console.log("Audio asset manifest contract passed.");
