import { randomBytes } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import {
  getPiperModelPath,
  PIPER_VOICE_INDEX,
  PIPER_VOICE_MODEL_FILES,
} from "@/lib/piper-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_TEXT_LEN = 8_000;
const DEFAULT_TTS_ENGINE = "piper";

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

function defaultKokoroPython(): string {
  const root = process.cwd();
  const win = path.join(root, ".venv-kokoro", "Scripts", "python.exe");
  const unix = path.join(root, ".venv-kokoro", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return "python";
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

  if (options.stdinText !== undefined && proc.stdin) {
    proc.stdin.write(options.stdinText, "utf8");
    proc.stdin.end();
  }

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(chunk.toString("utf8"));
  });

  const code = await new Promise<number | null>((resolve) => {
    proc.on("close", resolve);
  });

  return { code, stderr: stderr.join("") };
}

export async function POST(request: Request): Promise<Response> {
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
  let code: number | null = null;
  let stderr = "";
  let failureLabel = "TTS synthesis failed";

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

    const result = await runProcess({
      command: piperCommand.command,
      args: [
        ...piperCommand.argsPrefix,
        "-m",
        modelPath,
        ...speedArgs,
        "--output_file",
        outPath,
      ],
      stdinText: `${text}\n`,
    });
    code = result.code;
    stderr = result.stderr;
    failureLabel = "Piper synthesis failed";
  }

  if (code !== 0) {
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

  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
