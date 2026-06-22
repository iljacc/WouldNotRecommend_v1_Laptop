/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Production server and presentation-window supervisor.
 *
 * Env:
 *   PORT - Next.js port, default 3000.
 *   GSV_KIOSK - 0/false to skip browser launch; 1/true to force it.
 *   GSV_KIOSK_PATH - explicit Chrome, Edge, or Chromium executable.
 *   GSV_KIOSK_URLS - comma/semicolon-separated paths, default /bot,/terminal.
 *   GSV_KIOSK_MODE - app or kiosk. Multiple windows default to app.
 *   GSV_KIOSK_BOUNDS - route-order x,y,width,height entries; overrides detection.
 *   GSV_KIOSK_USER_DATA_DIR - dedicated browser profile directory.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  describeMonitors,
  discoverWindowsMonitors,
  parseBounds,
  selectPresentationBounds,
} = require("./windows-monitor-layout.cjs");

const root = path.join(__dirname, "..");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const logDir = path.join(root, ".tmp", "kiosk-logs");
const logPath = path.join(logDir, "launcher.log");
const browserChildren = new Set();
let shuttingDown = false;

// Installation fallback: TCL primary, Samsung immediately left and vertically centered.
const fallbackBounds = [
  { x: 0, y: 0, width: 3840, height: 2160 },
  { x: -1920, y: 540, width: 1920, height: 1080 },
];

function log(message, level = "log") {
  const line = `${new Date().toISOString()} ${message}`;
  console[level](`[start-with-kiosk] ${message}`);
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // Logging must never prevent the installation from starting.
  }
}

function parseBooleanEnv(value) {
  if (value === undefined || value === "") return undefined;
  const lower = String(value).toLowerCase();
  if (["0", "false", "no", "off"].includes(lower)) return false;
  if (["1", "true", "yes", "on"].includes(lower)) return true;
  return undefined;
}

function shouldOpenKiosk() {
  if (process.argv.includes("--kiosk")) return true;
  const explicit = parseBooleanEnv(process.env.GSV_KIOSK);
  if (explicit !== undefined) return explicit;
  return process.platform === "win32";
}

function findWindowsBrowser(relativeParts, executable) {
  const dirs = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LocalAppData,
  ].filter(Boolean);
  for (const base of dirs) {
    const candidate = path.join(base, ...relativeParts, executable);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findChromeLike() {
  const custom = process.env.GSV_KIOSK_PATH;
  if (custom && fs.existsSync(custom)) return custom;

  if (process.platform === "win32") {
    const chrome = findWindowsBrowser(
      ["Google", "Chrome", "Application"],
      "chrome.exe",
    );
    if (chrome) return chrome;
    return findWindowsBrowser(
      ["Microsoft", "Edge", "Application"],
      "msedge.exe",
    );
  }

  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  const { execFileSync } = require("child_process");
  for (const binary of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
    try {
      const resolved = execFileSync("which", [binary], { encoding: "utf8" }).trim();
      if (resolved) return resolved;
    } catch {
      // Try the next browser candidate.
    }
  }
  return null;
}

function waitForHttpReady(url, maxAttempts = 90, delayMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function tryOnce() {
      attempts += 1;
      let retryScheduled = false;
      function retryOnce() {
        if (retryScheduled) return;
        retryScheduled = true;
        retry();
      }
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", retryOnce);
      req.setTimeout(2500, () => {
        req.destroy();
        retryOnce();
      });
    }
    function retry() {
      if (attempts >= maxAttempts) {
        reject(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(tryOnce, delayMs);
      }
    }
    tryOnce();
  });
}

function parseUrlPaths() {
  const raw = process.env.GSV_KIOSK_URLS || process.env.GSV_KIOSK_URL || "/bot,/terminal";
  return raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("/") ? part : `/${part}`));
}

function getKioskMode(urlCount) {
  const mode = String(process.env.GSV_KIOSK_MODE || "").toLowerCase();
  if (mode === "kiosk" || mode === "app") return mode;
  return urlCount > 1 ? "app" : "kiosk";
}

function browserBaseArgs() {
  const profileDir =
    process.env.GSV_KIOSK_USER_DATA_DIR || path.join(root, ".tmp", "kiosk-browser");
  fs.mkdirSync(profileDir, { recursive: true });
  return [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
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
  const isEdge = browserPath.toLowerCase().endsWith("msedge.exe");
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

function launchBrowserWindow(browserPath, url, bounds, mode, index, attempt = 0) {
  if (shuttingDown) return;
  const startedAt = Date.now();
  const child = spawn(browserPath, browserWindowArgs(browserPath, url, bounds, mode), {
    stdio: "ignore",
    windowsHide: false,
  });
  browserChildren.add(child);
  log(`Opened ${mode} window ${index + 1} at ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}: ${url}`);

  child.on("error", (error) => log(`Browser window ${index + 1} error: ${error.message}`, "warn"));
  child.on("exit", (code, signal) => {
    browserChildren.delete(child);
    if (shuttingDown) return;
    const lifetimeMs = Date.now() - startedAt;
    if (code === 0 && !signal && lifetimeMs < 5000) {
      log(`Browser window ${index + 1} delegated to the existing kiosk profile.`);
      return;
    }
    const nextAttempt = attempt + 1;
    const retryMs = Math.min(2 ** nextAttempt * 1000, 30_000);
    log(
      `Browser window ${index + 1} exited (${signal || code}); relaunching in ${retryMs} ms.`,
      "warn",
    );
    setTimeout(
      () => launchBrowserWindow(browserPath, url, bounds, mode, index, nextAttempt),
      retryMs,
    );
  });
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
  shuttingDown = true;
  for (const child of browserChildren) {
    try { child.kill(); } catch { /* already gone */ }
  }
  if (!nextChild.killed) {
    try { nextChild.kill("SIGTERM"); } catch { /* already gone */ }
  }
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
nextChild.on("exit", (code, signal) => {
  if (shuttingDown) return;
  log(`Next.js exited (${signal || code}).`, "warn");
  shutdown(signal ? 1 : (code ?? 1));
});

(async () => {
  if (!shouldOpenKiosk()) {
    log("Kiosk browser launch disabled.");
    return;
  }
  const browser = findChromeLike();
  if (!browser) {
    log("No Chrome, Edge, or Chromium browser found; open the app manually.", "warn");
    return;
  }

  const paths = parseUrlPaths();
  const urls = paths.map((pathPart) => `http://127.0.0.1:${port}${pathPart}`);
  const overrideBounds = parseBounds(process.env.GSV_KIOSK_BOUNDS);
  const monitors = overrideBounds ? null : discoverWindowsMonitors();
  const placement = selectPresentationBounds(paths, monitors, overrideBounds, fallbackBounds);
  const mode = getKioskMode(urls.length);

  log(`Browser: ${browser}`);
  if (monitors) log(`Detected monitors: ${describeMonitors(monitors)}`);
  log(`Window placement source: ${placement.source}`);
  if (placement.warning) log(placement.warning, "warn");

  await waitForHttpReady(`http://127.0.0.1:${port}/`);
  for (let index = 0; index < urls.length; index += 1) {
    launchBrowserWindow(browser, urls[index], placement.bounds[index], mode, index);
    await delay(750);
  }
})().catch((error) => log(error.message || String(error), "warn"));
