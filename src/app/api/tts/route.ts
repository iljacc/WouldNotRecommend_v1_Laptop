import { createHash, randomBytes } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import {
  getPiperModelPath,
  PIPER_SENTENCE_SILENCE_MS,
  PIPER_VOICE_INDEX,
  PIPER_VOICE_MODEL_FILES,
} from "@/lib/piper-config";
import { sanitizePiperText } from "@/lib/tts-sanitize";
import {
  getPiperWorkerClient,
  type PiperWorkerSynthesisResult,
} from "@/lib/piper-worker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_TEXT_LEN = 8_000;
const DEFAULT_TTS_ENGINE = "piper";
const PIPER_WORKER_TIMEOUT_MS = 120_000;

type PiperCommand = {
  command: string;
  argsPrefix: string[];
};

type TtsRequestBody = {
  text?: unknown;
  engine?: unknown;
  piperVoiceIndex?: unknown;
  piperLengthScale?: unknown;
  kokoroVoice?: unknown;
  kokoroSpeed?: unknown;
  ttsContext?: unknown;
};

type TtsContext = {
  placeId?: string;
  reviewId?: string;
  businessName?: string;
  source?: string;
};

function defaultPiperCommand(): PiperCommand {
  const root = process.cwd();
  const pythonWin = path.join(root, ".venv-piper", "Scripts", "python.exe");
  const pythonUnix = path.join(root, ".venv-piper", "bin", "python");
  if (fs.existsSync(pythonWin)) {
    return { command: pythonWin, argsPrefix: ["-m", "piper"] };
  }
  if (fs.existsSync(pythonUnix)) {
    return { command: pythonUnix, argsPrefix: ["-m", "piper"] };
  }
  const win = path.join(root, ".venv-piper", "Scripts", "piper.exe");
  const unix = path.join(root, ".venv-piper", "bin", "piper");
  if (fs.existsSync(win)) return { command: win, argsPrefix: [] };
  if (fs.existsSync(unix)) return { command: unix, argsPrefix: [] };
  return { command: "piper", argsPrefix: [] };
}

function defaultPiperPython(): string | null {
  const root = process.cwd();
  const pythonWin = path.join(root, ".venv-piper", "Scripts", "python.exe");
  const pythonUnix = path.join(root, ".venv-piper", "bin", "python");
  if (fs.existsSync(pythonWin)) return pythonWin;
  if (fs.existsSync(pythonUnix)) return pythonUnix;
  return null;
}

function defaultKokoroPython(): string {
  const root = process.cwd();
  const win = path.join(root, ".venv-kokoro", "Scripts", "python.exe");
  const unix = path.join(root, ".venv-kokoro", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return "python";
}

function readContext(value: unknown): TtsContext {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return {
    placeId: readContextString(source.placeId),
    reviewId: readContextString(source.reviewId),
    businessName: readContextString(source.businessName),
    source: readContextString(source.source),
  };
}

function readContextString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 240)
    : undefined;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

async function runProcess(options: {
  command: string;
  args: string[];
  stdinText?: string;
}): Promise<{ code: number | null; stderr: string }> {
  const stderr: string[] = [];
  const proc = spawn(options.command, options.args, {
    stdio: [options.stdinText === undefined ? "ignore" : "pipe", "ignore", "pipe"],
    cwd: process.cwd(),
  });

  return new Promise((resolve) => {
    proc.on("error", (error: NodeJS.ErrnoException) => {
      resolve({
        code: error.errno ?? -1,
        stderr: error.message,
      });
    });

    if (options.stdinText !== undefined && proc.stdin) {
      proc.stdin.on("error", () => {
        /* Process startup errors are reported through proc.on("error"). */
      });
      proc.stdin.write(options.stdinText, "utf8");
      proc.stdin.end();
    }

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr.push(chunk.toString("utf8"));
    });

    proc.on("close", (code) => {
      resolve({ code, stderr: stderr.join("") });
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  const routeStartedAt = performance.now();
  let body: TtsRequestBody;
  try {
    body = (await request.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text =
    typeof body.text === "string"
      ? body.text.trim()
      : "";

  if (!text.length) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LEN) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  const tmpDir = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, `tts-${randomBytes(16).toString("hex")}.wav`);
  const inputPath = path.join(tmpDir, `tts-${randomBytes(16).toString("hex")}.txt`);

  const cleanup = () => {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
  };

  const requestedEngine = typeof body.engine === "string" ? body.engine : "";
  const engine = (requestedEngine || process.env.TTS_ENGINE || DEFAULT_TTS_ENGINE).toLowerCase();
  const ttsContext = readContext(body.ttsContext);
  let code: number | null = null;
  let stderr = "";
  let failureLabel = "TTS synthesis failed";
  let piperWorkerTiming: PiperWorkerSynthesisResult | null = null;
  let usedPersistentPiperWorker = false;
  let usedPiperFallback = false;
  let piperSanitization:
    | {
        originalLength: number;
        sanitizedLength: number;
        removedControlChars: number;
        removedSurrogateChars: number;
        removedFormatChars: number;
        removedNonAsciiChars: number;
        replacedPunctuationChars: number;
        originalHash: string;
        sanitizedHash: string;
      }
    | null = null;

  if (engine === "kokoro") {
    const kokoroPython = process.env.KOKORO_PYTHON_PATH ?? defaultKokoroPython();
    if (!fs.existsSync(kokoroPython) && kokoroPython !== "python") {
      return NextResponse.json(
        { error: `Kokoro Python executable not found: ${kokoroPython}` },
        { status: 500 },
      );
    }

    await fs.promises.writeFile(inputPath, text, "utf8");
    const scriptPath = path.join(process.cwd(), "scripts", "kokoro-synth.py");
    const kokoroSpeed =
      typeof body.kokoroSpeed === "number" && Number.isFinite(body.kokoroSpeed)
        ? String(Math.min(2, Math.max(0.5, body.kokoroSpeed)))
        : process.env.KOKORO_SPEED || "1";
    const kokoroVoice =
      typeof body.kokoroVoice === "string" && body.kokoroVoice.trim()
        ? body.kokoroVoice.trim()
        : process.env.KOKORO_VOICE || "af_heart";

    const result = await runProcess({
      command: kokoroPython,
      args: [
        scriptPath,
        "--text-file",
        inputPath,
        "--output-file",
        outPath,
        "--voice",
        kokoroVoice,
        "--lang",
        process.env.KOKORO_LANG || "a",
        "--speed",
        kokoroSpeed,
      ],
    });
    code = result.code;
    stderr = result.stderr;
    failureLabel = "Kokoro synthesis failed";
  } else {
    const piperVoiceIndex =
      typeof body.piperVoiceIndex === "number" &&
      Number.isInteger(body.piperVoiceIndex) &&
      body.piperVoiceIndex >= 0 &&
      body.piperVoiceIndex < PIPER_VOICE_MODEL_FILES.length
        ? body.piperVoiceIndex
        : PIPER_VOICE_INDEX;
    const modelPath = getPiperModelPath(piperVoiceIndex);
    if (!fs.existsSync(modelPath)) {
      return NextResponse.json(
        { error: `Piper model not found: ${modelPath}` },
        { status: 500 },
      );
    }

    const piperCommand = process.env.PIPER_PATH
      ? { command: process.env.PIPER_PATH, argsPrefix: [] }
      : defaultPiperCommand();
    if (!fs.existsSync(piperCommand.command) && piperCommand.command !== "piper") {
      return NextResponse.json(
        { error: `Piper executable not found: ${piperCommand.command}` },
        { status: 500 },
      );
    }

    const piperLengthScale =
      typeof body.piperLengthScale === "number" && Number.isFinite(body.piperLengthScale)
        ? Math.min(2, Math.max(0.5, body.piperLengthScale))
        : null;
    const speedArgs = piperLengthScale === null ? [] : ["--length_scale", String(piperLengthScale)];
    const sentenceSilenceArgs = [
      "--sentence_silence",
      String(PIPER_SENTENCE_SILENCE_MS / 1000),
    ];

    const sanitized = sanitizePiperText(text);
    if (!sanitized.text.length) {
      return NextResponse.json(
        { error: "Text is empty after Piper sanitization" },
        { status: 400 },
      );
    }
    piperSanitization = {
      originalLength: text.length,
      sanitizedLength: sanitized.text.length,
      removedControlChars: sanitized.removedControlChars,
      removedSurrogateChars: sanitized.removedSurrogateChars,
      removedFormatChars: sanitized.removedFormatChars,
      removedNonAsciiChars: sanitized.removedNonAsciiChars,
      replacedPunctuationChars: sanitized.replacedPunctuationChars,
      originalHash: shortHash(text),
      sanitizedHash: shortHash(sanitized.text),
    };

    const persistentWorkerEnabled =
      process.env.PIPER_PERSISTENT_WORKER !== "false" &&
      !process.env.PIPER_PATH;
    const piperPython = defaultPiperPython();

    if (persistentWorkerEnabled && piperPython) {
      usedPersistentPiperWorker = true;
      try {
        const worker = getPiperWorkerClient({
          pythonPath: piperPython,
          scriptPath: path.join(process.cwd(), "scripts", "piper-worker.py"),
          cwd: process.cwd(),
          timeoutMs: PIPER_WORKER_TIMEOUT_MS,
        });
        piperWorkerTiming = await worker.synthesize({
          text: sanitized.text,
          modelPath,
          outputPath: outPath,
          lengthScale: piperLengthScale,
          sentenceSilenceMs: PIPER_SENTENCE_SILENCE_MS,
        });
        code = 0;
      } catch (error) {
        usedPiperFallback = true;
        console.warn("Persistent Piper worker failed; using one-shot fallback", {
          context: ttsContext,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!usedPersistentPiperWorker || usedPiperFallback) {
      const result = await runProcess({
        command: piperCommand.command,
        args: [
          ...piperCommand.argsPrefix,
          "-m",
          modelPath,
          ...speedArgs,
          ...sentenceSilenceArgs,
          "--output_file",
          outPath,
        ],
        stdinText: `${sanitized.text}\n`,
      });
      code = result.code;
      stderr = result.stderr;
    }
    failureLabel = "Piper synthesis failed";
  }

  if (code !== 0) {
    console.error("TTS synthesis process failed", {
      engine,
      failureLabel,
      exitCode: code,
      context: ttsContext,
      piperSanitization,
      textPreview: text.replace(/\s+/g, " ").slice(0, 240),
      fullStderr: stderr,
    });
    cleanup();
    return NextResponse.json(
      {
        error: failureLabel,
        detail: stderr.slice(0, 1_000),
      },
      { status: 500 },
    );
  }

  let wav: Buffer | undefined;
  try {
    wav = await fs.promises.readFile(outPath);
  } catch {
    return NextResponse.json({ error: "Failed to read Piper output" }, { status: 500 });
  } finally {
    cleanup();
  }

  if (!wav?.length) {
    return NextResponse.json({ error: "Empty audio output" }, { status: 500 });
  }

  const routeTotalMs = Math.round(performance.now() - routeStartedAt);
  if (engine === "piper") {
    console.info("Piper synthesis timing", {
      context: ttsContext,
      persistentWorker: usedPersistentPiperWorker,
      fallback: usedPiperFallback,
      worker: piperWorkerTiming,
      routeTotalMs,
    });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Cache-Control": "no-store",
  };
  if (piperWorkerTiming) {
    responseHeaders["Server-Timing"] = [
      `piper_model;dur=${piperWorkerTiming.modelLoadMs}`,
      `piper_synthesis;dur=${piperWorkerTiming.synthesisMs}`,
      `piper_worker;dur=${piperWorkerTiming.totalMs}`,
      `tts_route;dur=${routeTotalMs}`,
    ].join(", ");
    responseHeaders["X-Piper-Model-Cache"] = piperWorkerTiming.modelCacheHit
      ? "hit"
      : "miss";
  } else if (engine === "piper") {
    responseHeaders["Server-Timing"] = `tts_route;dur=${routeTotalMs}`;
    responseHeaders["X-Piper-Model-Cache"] = "fallback";
  }

  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: responseHeaders,
  });
}
