/* eslint-disable @typescript-eslint/no-require-imports */

const { spawnSync } = require("child_process");

function parseBounds(raw) {
  if (!raw) return null;
  const parsed = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const values = entry.split(",").map((part) => Number.parseInt(part.trim(), 10));
      if (values.length !== 4 || values.some(Number.isNaN)) {
        throw new Error(`Invalid GSV_KIOSK_BOUNDS entry "${entry}". Use x,y,width,height.`);
      }
      const [x, y, width, height] = values;
      if (width <= 0 || height <= 0) {
        throw new Error(`Invalid GSV_KIOSK_BOUNDS entry "${entry}". Width and height must be positive.`);
      }
      return { x, y, width, height };
    });
  return parsed.length > 0 ? parsed : null;
}

function monitorBounds(monitor) {
  return {
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height,
  };
}

function selectPresentationBounds(paths, monitors, overrideBounds, fallbackBounds) {
  if (overrideBounds?.length) {
    return {
      source: "override",
      bounds: paths.map((_, index) => overrideBounds[index] || overrideBounds[0]),
      warning: null,
    };
  }

  const active = Array.isArray(monitors) ? monitors : [];
  const botTarget = active.find(
    (monitor) => monitor.primary && monitor.width >= 3800 && monitor.height >= 2100,
  );
  const terminalTargets = active.filter(
    (monitor) => !monitor.primary && monitor.width === 1920 && monitor.height === 1080,
  );

  if (!botTarget || terminalTargets.length !== 1) {
    const missing = !botTarget
      ? "primary 4K display was not found"
      : "exactly one non-primary 1920x1080 display was not found";
    return {
      source: "fallback",
      bounds: paths.map((_, index) => fallbackBounds[index] || fallbackBounds[0]),
      warning: `Automatic monitor placement unavailable: ${missing}.`,
    };
  }

  const terminalTarget = terminalTargets[0];
  return {
    source: "detected",
    bounds: paths.map((path, index) => {
      if (path.split("?")[0] === "/bot") return monitorBounds(botTarget);
      if (path.split("?")[0] === "/terminal") return monitorBounds(terminalTarget);
      return fallbackBounds[index] || fallbackBounds[0];
    }),
    warning: null,
  };
}

function describeMonitors(monitors) {
  if (!monitors?.length) return "none detected";
  return monitors
    .map(
      (monitor) =>
        `${monitor.deviceName || "display"} ${monitor.width}x${monitor.height} at ` +
        `${monitor.x},${monitor.y}${monitor.primary ? " primary" : ""}`,
    )
    .join("; ");
}

function discoverWindowsMonitors() {
  if (process.platform !== "win32") return null;
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DpiAwareness {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
'@
  [DpiAwareness]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
} catch { }
@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [pscustomobject]@{
    deviceName = $_.DeviceName
    x = $_.Bounds.X
    y = $_.Bounds.Y
    width = $_.Bounds.Width
    height = $_.Bounds.Height
    primary = $_.Primary
  }
}) | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 },
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const parsed = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

module.exports = {
  describeMonitors,
  discoverWindowsMonitors,
  parseBounds,
  selectPresentationBounds,
};
