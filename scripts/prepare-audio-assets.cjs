/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const SOURCE = join(ROOT, "audio");
const OUTPUT = join(ROOT, "public", "audio");
const MANIFEST = join(ROOT, "src", "lib", "audio-assets.ts");
const BOT_RUNNING_TARGET_LUFS = -36;
const TURN_TARGET_LUFS = -27;
const STEP_TARGET_LUFS = -27;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";

function requireCommand(command) {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} is required to prepare audio assets`);
  }
}

function audioFiles(folder) {
  const path = join(SOURCE, folder);
  if (!existsSync(path)) throw new Error(`Missing source folder: ${path}`);
  return readdirSync(path)
    .filter((name) => /\.(wav|wave|aif|aiff|flac|mp3|m4a)$/i.test(name))
    .map((name) => ({ name, path: join(path, name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function namedAudioFile(folder, name) {
  const path = join(SOURCE, folder, name);
  if (!existsSync(path)) throw new Error(`Missing source audio: ${path}`);
  return { name, path };
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function uniqueFiles(files) {
  const byHash = new Map();
  for (const file of files) {
    const hash = hashFile(file.path);
    const current = byHash.get(hash);
    const isCopyName = / \(\d+\)(?=\.[^.]+$)/.test(file.name);
    const currentIsCopy = current
      ? / \(\d+\)(?=\.[^.]+$)/.test(current.name)
      : true;
    if (!current || (currentIsCopy && !isCopyName)) byHash.set(hash, file);
  }
  return [...byHash.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || "unknown error";
    throw new Error(`${label} failed:\n${detail}`);
  }
  return result;
}

function analyzeLoudness(input, target, preFilter = "") {
  const filters = [
    preFilter,
    `loudnorm=I=${target}:TP=-2:LRA=20:print_format=json`,
  ]
    .filter(Boolean)
    .join(",");
  const result = run(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-af",
      filters,
      "-f",
      "null",
      NULL_DEVICE,
    ],
    `Loudness analysis for ${input}`,
  );
  const match = result.stderr.match(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/g);
  if (!match?.length) throw new Error(`Could not parse loudness analysis for ${input}`);
  return JSON.parse(match.at(-1));
}

function loudnessFilter(input, target, preFilter = "") {
  const measured = analyzeLoudness(input, target, preFilter);
  const filters = [
    preFilter,
    `loudnorm=I=${target}`,
  ].filter(Boolean);
  filters[filters.length - 1] = [
    filters[filters.length - 1],
    "TP=-2",
    "LRA=20",
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  return filters.join(",");
}

function resetOutputFolder(folder) {
  mkdirSync(folder, { recursive: true });
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (/\.(webm|wav)$/i.test(name)) unlinkSync(path);
  }
}

function convertBotRunning(file, output) {
  const filter = loudnessFilter(file.path, BOT_RUNNING_TARGET_LUFS);
  run(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-i",
      file.path,
      "-map",
      "0:a:0",
      "-vn",
      "-map_metadata",
      "-1",
      "-af",
      `${filter},aresample=48000`,
      "-ac",
      "2",
      "-c:a",
      "libopus",
      "-b:a",
      "160k",
      "-application",
      "audio",
      output,
    ],
    `Bot-running conversion for ${file.name}`,
  );
}

function machineStepFilter() {
  return [
    "highpass=f=120",
    "lowpass=f=7600",
    "vibrato=f=3.7:d=0.075",
    "acrusher=bits=11:samples=5:mix=0.42",
    "aphaser=in_gain=0.7:out_gain=0.85:delay=2.8:decay=0.35:speed=0.45:type=t",
    "acompressor=threshold=-18dB:ratio=2.2:attack=8:release=80",
    "alimiter=limit=0.88",
  ].join(",");
}

function convertPcm(file, output, targetLufs, label, preFilter = "") {
  const filter = loudnessFilter(file.path, targetLufs, preFilter);
  run(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-i",
      file.path,
      "-map",
      "0:a:0",
      "-vn",
      "-map_metadata",
      "-1",
      "-af",
      `${filter},aresample=48000`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      output,
    ],
    `${label} conversion for ${file.name}`,
  );
}

function formatManifest(botRunningUrl, turningUrl, footstepUrls) {
  const format = (name, urls) =>
    `export const ${name} = [\n${urls.map((url) => `  "${url}",`).join("\n")}\n] as const;`;
  return [
    "/** Generated by `npm run audio:prepare`. Do not edit by hand. */",
    `export const BOT_RUNNING_AUDIO_URL = "${botRunningUrl}";`,
    `export const TURNING_AUDIO_URL = "${turningUrl}";`,
    "",
    format("FOOTSTEP_AUDIO_URLS", footstepUrls),
    "",
  ].join("\n");
}

function main() {
  requireCommand("ffmpeg");
  requireCommand("ffprobe");

  const botRunning = namedAudioFile(
    "bot_running",
    "UIData_Generic Robotics Medium Data Processing Constant 01_B00M_ONE_2.wav",
  );
  const turning = namedAudioFile(
    "turning_loop",
    "UIData_Generic Robotics Medium Data Processing Constant 01_B00M_ONE.wav",
  );
  const steps = uniqueFiles(audioFiles("bot_stepping"));
  const oldAmbientOutput = join(OUTPUT, "ambient");
  const botRunningOutput = join(OUTPUT, "bot-running");
  const turningOutput = join(OUTPUT, "turning");
  const stepsOutput = join(OUTPUT, "steps");
  resetOutputFolder(oldAmbientOutput);
  resetOutputFolder(botRunningOutput);
  resetOutputFolder(turningOutput);
  resetOutputFolder(stepsOutput);

  const botRunningName = "bot-running.webm";
  const botRunningUrl = `/audio/bot-running/${botRunningName}`;
  console.log(`bot-running: ${botRunning.name} -> ${botRunningName}`);
  convertBotRunning(botRunning, join(botRunningOutput, botRunningName));

  const turningName = "turning-loop.wav";
  const turningUrl = `/audio/turning/${turningName}`;
  console.log(`turning: ${turning.name} -> ${turningName}`);
  convertPcm(turning, join(turningOutput, turningName), TURN_TARGET_LUFS, "Turning");

  const footstepUrls = steps.map((file, index) => {
    const name = `step-${String(index + 1).padStart(2, "0")}.wav`;
    console.log(`step: ${file.name} -> ${name}`);
    convertPcm(
      file,
      join(stepsOutput, name),
      STEP_TARGET_LUFS,
      "Footstep",
      machineStepFilter(),
    );
    return `/audio/steps/${name}`;
  });

  writeFileSync(
    MANIFEST,
    formatManifest(botRunningUrl, turningUrl, footstepUrls),
    "utf8",
  );
  console.log(`Prepared bot-running, turning, and ${footstepUrls.length} step assets.`);
}

main();
