/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Production start with optional presentation browser windows.
 *
 * Defaults for the gallery laptop:
 * - Windows opens /bot and /terminal in fullscreen app windows.
 * - Both windows share one browser profile so BroadcastChannel still works.
 *
 * Env:
 *   PORT - passed through to Next (same as `next start`).
 *   GSV_KIOSK - 0/false to skip; 1/true to force kiosk even off Windows.
 *   GSV_KIOSK_PATH - path to Edge or Chrome/Chromium binary.
 *   GSV_KIOSK_URL - legacy single path, e.g. /bot.
 *   GSV_KIOSK_URLS - comma/semicolon-separated paths, e.g. /bot,/terminal.
 *   GSV_KIOSK_MODE - app or kiosk. Defaults to app for multiple windows.
 *   GSV_KIOSK_BOUNDS - semicolon-separated x,y,width,height window bounds.
 *   GSV_KIOSK_USER_DATA_DIR - browser profile dir, default .tmp/kiosk-browser.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const defaultBounds = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 1920, y: 0, width: 1920, height: 1080 },
];

function parseBooleanEnv(value) {
  if (value === undefined || value === "") return undefined;
  const lower = String(value).toLowerCase();
  if (["0", "false", "no", "off"].includes(lower)) return false;
  if (["1", "true", "yes", "on"].includes(lower)) return true;
  return undefined;
}

function shouldOpenKiosk() {
  const explicit = parseBooleanEnv(process.env.GSV_KIOSK);
  if (explicit !== undefined) return explicit;
  return process.platform === "win32";
}

function findEdgeWindows() {
  const dirs = [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
  ].filter(Boolean);
  for (const base of dirs) {
    const edgePath = path.join(
      base,
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    );
    if (fs.existsSync(edgePath)) return edgePath;
  }
  return null;
}

function findChromeLike() {
  const custom = process.env.GSV_KIOSK_PATH;
  if (custom && fs.existsSync(custom)) return custom;

  if (process.platform === "win32") {
    const edge = findEdgeWindows();
    if (edge) return edge;

    const dirs = [
      process.env["ProgramFiles(x86)"],
      process.env.ProgramFiles,
      process.env.LocalAppData,
    ].filter(Boolean);
    for (const base of dirs) {
      const chrome = path.join(base, "Google", "Chrome", "Application", "chrome.exe");
      if (fs.existsSync(chrome)) return chrome;
    }
    return null;
  }

  if (process.platform === "darwin") {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(chrome)) return chrome;
    const chromium = "/Applications/Chromium.app/Contents/MacOS/Chromium";
    if (fs.existsSync(chromium)) return chromium;
    return null;
  }

  const candidates = [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ];
  for (const bin of candidates) {
    try {
      const { execSync } = require("child_process");
      const resolved = execSync(`command -v ${bin} 2>/dev/null`, {
        encoding: "utf8",
      }).trim();
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

function parseUrlPaths() {
  const raw =
    process.env.GSV_KIOSK_URLS ||
    process.env.GSV_KIOSK_URL ||
    "/bot,/terminal";
  return raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("/") ? part : `/${part}`));
}

function toLocalUrl(pathPart) {
  return `http://127.0.0.1:${port}${pathPart}`;
}

function parseBounds() {
  const raw = process.env.GSV_KIOSK_BOUNDS;
  if (!raw) return defaultBounds;

  const parsed = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [x, y, width, height] = entry
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10));
      if ([x, y, width, height].some((value) => Number.isNaN(value))) {
        throw new Error(
          `Invalid GSV_KIOSK_BOUNDS entry "${entry}". Use x,y,width,height.`,
        );
      }
      return { x, y, width, height };
    });

  return parsed.length > 0 ? parsed : defaultBounds;
}

function getKioskMode(urlCount) {
  const mode = String(process.env.GSV_KIOSK_MODE || "").toLowerCase();
  if (mode === "kiosk" || mode === "app") return mode;
  return urlCount > 1 ? "app" : "kiosk";
}

function browserBaseArgs() {
  const profileDir =
    process.env.GSV_KIOSK_USER_DATA_DIR ||
    path.join(root, ".tmp", "kiosk-browser");

  fs.mkdirSync(profileDir, { recursive: true });

  return [
    "--no-first-run",
    "--disable-infobars",
    "--disable-session-crashed-bubble",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
    `--user-data-dir=${profileDir}`,
  ];
}

function browserWindowArgs(browserPath, url, bounds, mode) {
  const lowerPath = browserPath.toLowerCase();
  const isEdge = lowerPath.endsWith("msedge.exe");
  const baseArgs = browserBaseArgs();

  if (mode === "kiosk") {
    return isEdge
      ? [...baseArgs, "--kiosk", url, "--edge-kiosk-type=fullscreen"]
      : [...baseArgs, "--kiosk", url];
  }

  return [
    ...baseArgs,
    "--new-window",
    `--app=${url}`,
    "--start-fullscreen",
    `--window-position=${bounds.x},${bounds.y}`,
    `--window-size=${bounds.width},${bounds.height}`,
  ];
}

function openBrowserWindow(browserPath, url, bounds, mode, index) {
  const args = browserWindowArgs(browserPath, url, bounds, mode);
  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(
    `[start-with-kiosk] Opened ${mode} window ${index + 1}: ${url}`,
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    console.log("[start-with-kiosk] Kiosk disabled.");
    return;
  }

  const browser = findChromeLike();
  if (!browser) {
    console.warn(
      "[start-with-kiosk] No Edge/Chrome found; start the app URL manually.",
    );
    return;
  }

  const paths = parseUrlPaths();
  const urls = paths.map(toLocalUrl);
  const bounds = parseBounds();
  const mode = getKioskMode(urls.length);
  const probe = `http://127.0.0.1:${port}/`;

  try {
    await waitForHttpReady(probe);
    for (let i = 0; i < urls.length; i += 1) {
      openBrowserWindow(browser, urls[i], bounds[i] || bounds[0], mode, i);
      await delay(750);
    }
  } catch (e) {
    console.warn("[start-with-kiosk]", e.message || e);
  }
})().catch((e) => console.warn("[start-with-kiosk]", e));
