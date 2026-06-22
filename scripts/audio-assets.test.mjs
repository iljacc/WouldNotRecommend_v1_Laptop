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

function urlFor(exportName) {
  const match = manifest.match(
    new RegExp(`export const ${exportName} = "([^"]+)"`),
  );
  assert.ok(match, `missing ${exportName}`);
  return match[1];
}

const botRunningUrl = urlFor("BOT_RUNNING_AUDIO_URL");
const turningUrl = urlFor("TURNING_AUDIO_URL");
const footstepUrls = urlsFor("FOOTSTEP_AUDIO_URLS");

assert.equal(footstepUrls.length, 12, "manifest should contain twelve step pairs");

for (const url of [botRunningUrl, turningUrl, ...footstepUrls]) {
  assert.ok(!url.includes(" "), `URL should not contain spaces: ${url}`);
  assert.ok(!url.includes("(1)"), `URL should not contain duplicate suffix: ${url}`);
  assert.ok(
    existsSync(join(root, "public", ...url.split("/").filter(Boolean))),
    `generated asset should exist: ${url}`,
  );
}

console.log("Audio asset manifest contract passed.");
