/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const configPath = path.join(root, "src", "lib", "piper-config.ts");
const voicesDir = path.join(root, "vendor", "piper-voices");
const piperVersion = "v1.0.0";

function readPiperConfig() {
  const source = fs.readFileSync(configPath, "utf8");
  const filesMatch = source.match(/PIPER_VOICE_MODEL_FILES\s*=\s*\[([\s\S]*?)\]/);
  const indexMatch = source.match(/PIPER_VOICE_INDEX\s*=\s*(\d+)/);
  if (!filesMatch || !indexMatch) {
    throw new Error(`Could not read Piper voice config from ${configPath}`);
  }

  const files = [...filesMatch[1].matchAll(/"([^"]+\.onnx)"/g)].map(
    (match) => match[1],
  );
  const index = Number.parseInt(indexMatch[1], 10);
  const file = files[index];
  if (!file) {
    throw new Error(`Configured PIPER_VOICE_INDEX=${index} does not match any model file`);
  }

  return { index, file };
}

function voiceParts(file) {
  const match = file.match(/^en_US-(.+)-medium\.onnx(?:\.json)?$/);
  if (!match) {
    throw new Error(`Unsupported Piper model filename: ${file}`);
  }
  return {
    voice: match[1],
    quality: "medium",
  };
}

function downloadUrl(file) {
  const modelFile = file.replace(/\.json$/, "");
  const { voice, quality } = voiceParts(file);
  return `https://huggingface.co/rhasspy/piper-voices/resolve/${piperVersion}/en/en_US/${voice}/${quality}/${modelFile}${file.endsWith(".json") ? ".json" : ""}?download=true`;
}

function downloadFile(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
    console.log(`[setup:piper] Already present: ${path.relative(root, destination)}`);
    return Promise.resolve();
  }

  console.log(`[setup:piper] Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          output.close();
          fs.unlink(destination, () => {
            const nextUrl = new URL(response.headers.location, url).toString();
            downloadFile(nextUrl, destination).then(resolve, reject);
          });
          return;
        }

        if (response.statusCode !== 200) {
          output.close();
          fs.unlink(destination, () => {});
          reject(new Error(`Download failed (${response.statusCode}) for ${url}`));
          return;
        }

        response.pipe(output);
        output.on("finish", () => output.close(resolve));
      })
      .on("error", (error) => {
        output.close();
        fs.unlink(destination, () => {});
        reject(error);
      });
  });
}

function commandExists(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function findPython() {
  const candidates =
    process.platform === "win32"
      ? [
          { command: "py", args: ["-3"] },
          { command: "python", args: [] },
        ]
      : [
          { command: "python3", args: [] },
          { command: "python", args: [] },
        ];

  for (const candidate of candidates) {
    if (commandExists(candidate.command, [...candidate.args, "--version"])) {
      return candidate;
    }
  }

  throw new Error("Python 3 was not found. Install Python 3, then rerun npm run setup:piper.");
}

function venvPythonPath() {
  return process.platform === "win32"
    ? path.join(root, ".venv-piper", "Scripts", "python.exe")
    : path.join(root, ".venv-piper", "bin", "python");
}

function run(command, args, options = {}) {
  console.log(`[setup:piper] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.allowFailure ? "pipe" : "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    if (options.allowFailure) return false;
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
  return true;
}

function removePiperVenv() {
  const venvPath = path.join(root, ".venv-piper");
  const resolved = path.resolve(venvPath);
  if (path.basename(resolved) !== ".venv-piper" || !resolved.startsWith(root)) {
    throw new Error(`Refusing to remove unexpected venv path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function createPiperVenv() {
  const python = findPython();
  run(python.command, [...python.args, "-m", "venv", ".venv-piper"]);
}

function ensurePiperVenv() {
  const pythonPath = venvPythonPath();
  if (!fs.existsSync(pythonPath)) {
    createPiperVenv();
  }

  const installed = run(
    pythonPath,
    ["-m", "pip", "install", "--upgrade", "pip", "piper-tts"],
    { allowFailure: true },
  );
  if (installed) return;

  console.log("[setup:piper] Existing .venv-piper is unhealthy; recreating it.");
  removePiperVenv();
  createPiperVenv();
  run(venvPythonPath(), ["-m", "pip", "install", "--upgrade", "pip", "piper-tts"]);
}

async function main() {
  const { file, index } = readPiperConfig();
  const modelPath = path.join(voicesDir, file);
  const configJsonPath = path.join(voicesDir, `${file}.json`);

  await downloadFile(downloadUrl(file), modelPath);
  await downloadFile(downloadUrl(`${file}.json`), configJsonPath);
  ensurePiperVenv();

  console.log(`[setup:piper] Ready: voice index ${index} (${file})`);
}

main().catch((error) => {
  console.error(`[setup:piper] ${error.message}`);
  process.exit(1);
});
