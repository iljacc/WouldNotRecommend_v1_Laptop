/**
 * Production start with optional presentation (kiosk) browser.
 *
 * - Default: on Windows, opens Edge in kiosk fullscreen to the bot page once the server is up.
 * - Disable: set GSV_KIOSK=0 (or false).
 * - Force kiosk on non-Windows: set GSV_KIOSK=1 and install Chrome/Chromium in a default location.
 *
 * Env:
 *   PORT — passed through to Next (same as `next start`).
 *   GSV_KIOSK — 0/false to skip; 1/true to force kiosk even off Windows.
 *   GSV_KIOSK_PATH — path to Edge or Chrome/Chromium binary (overrides auto-detect).
 *   GSV_KIOSK_URL — path only, default /bot (e.g. /terminal for the other screen).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number.parseInt(process.env.PORT || "3000", 10);

/** Unset → kiosk on Windows only; GSV_KIOSK=1|true → any OS; GSV_KIOSK=0|false → never. */
function shouldOpenKiosk() {
  const v = process.env.GSV_KIOSK;
  if (v !== undefined && v !== "") {
    const lower = String(v).toLowerCase();
    if (["0", "false", "no", "off"].includes(lower)) return false;
    if (["1", "true", "yes", "on"].includes(lower)) return true;
  }
  return process.platform === "win32";
}

function findEdgeWindows() {
  const dirs = [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
  ].filter(Boolean);
  for (const base of dirs) {
    const p = path.join(base, "Microsoft", "Edge", "Application", "msedge.exe");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findChromeLike() {
  const custom = process.env.GSV_KIOSK_PATH;
  if (custom && fs.existsSync(custom)) return custom;

  if (process.platform === "win32") {
    const edge = findEdgeWindows();
    if (edge) return edge;
    const pf = process.env["ProgramFiles(x86)"] || process.env.ProgramFiles;
    if (pf) {
      const chrome = path.join(pf, "Google", "Chrome", "Application", "chrome.exe");
      if (fs.existsSync(chrome)) return chrome;
    }
    return null;
  }

  if (process.platform === "darwin") {
    const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(mac)) return mac;
    const chromium = "/Applications/Chromium.app/Contents/MacOS/Chromium";
    if (fs.existsSync(chromium)) return chromium;
    return null;
  }

  const which = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"];
  for (const bin of which) {
    try {
      const { execSync } = require("child_process");
      const resolved = execSync(`command -v ${bin} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (resolved) return resolved;
    } catch {
      /* continue */
    }
  }
  return null;
}

function waitForHttpReady(url, maxAttempts = 90, delayMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function tryOnce() {
      attempts += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
      req.setTimeout(2500, () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
    }
    tryOnce();
  });
}

function kioskUrl() {
  const pathPart = process.env.GSV_KIOSK_URL || "/bot";
  const normalized = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return `http://127.0.0.1:${port}${normalized}`;
}

function openKiosk(browserPath, url) {
  const args =
    process.platform === "win32" && browserPath.endsWith("msedge.exe")
      ? ["--kiosk", url, "--edge-kiosk-type=fullscreen"]
      : ["--kiosk", url, "--window-size=1920,1080"];

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  // eslint-disable-next-line no-console
  console.log(`[start-with-kiosk] Opened kiosk: ${browserPath}\n  ${url}`);
}

const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(nextCli)) {
  console.error("[start-with-kiosk] Next CLI not found. Run npm install and npm run build first.");
  process.exit(1);
}

const nextChild = spawn(process.execPath, [nextCli, "start"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

function shutdown(code) {
  if (nextChild && !nextChild.killed) {
    try {
      nextChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

nextChild.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

(async () => {
  if (!shouldOpenKiosk()) {
    const v = process.env.GSV_KIOSK;
    if (v && ["0", "false", "no", "off"].includes(String(v).toLowerCase())) {
      // eslint-disable-next-line no-console
      console.log("[start-with-kiosk] Kiosk disabled (GSV_KIOSK=0).");
    }
    return;
  }

  const browser = findChromeLike();
  if (!browser) {
    console.warn(
      "[start-with-kiosk] No Edge/Chrome found; start the app URL manually in kiosk mode.",
    );
    return;
  }

  const url = kioskUrl();
  const probe = `http://127.0.0.1:${port}/`;

  try {
    await waitForHttpReady(probe);
    openKiosk(browser, url);
  } catch (e) {
    console.warn("[start-with-kiosk]", e.message || e);
  }
})().catch((e) => console.warn("[start-with-kiosk]", e));
