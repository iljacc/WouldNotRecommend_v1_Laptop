import { randomBytes } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { getPiperModelPath, PIPER_VOICE_INDEX } from "@/lib/piper-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_TEXT_LEN = 8_000;

function defaultPiperExecutable(): string {
  const root = process.cwd();
  const win = path.join(root, ".venv-piper", "Scripts", "piper.exe");
  const unix = path.join(root, ".venv-piper", "bin", "piper");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return "piper";
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof (body as { text: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (!text.length) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LEN) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  const modelPath = getPiperModelPath(PIPER_VOICE_INDEX);
  if (!fs.existsSync(modelPath)) {
    return NextResponse.json(
      { error: `Piper model not found: ${modelPath}` },
      { status: 500 },
    );
  }

  const piperPath = process.env.PIPER_PATH ?? defaultPiperExecutable();
  if (!fs.existsSync(piperPath) && piperPath !== "piper") {
    return NextResponse.json(
      { error: `Piper executable not found: ${piperPath}` },
      { status: 500 },
    );
  }

  const tmpDir = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, `tts-${randomBytes(16).toString("hex")}.wav`);

  const stderr: string[] = [];

  const proc = spawn(
    piperPath,
    ["-m", modelPath, "--output_file", outPath],
    {
      stdio: ["pipe", "ignore", "pipe"],
      cwd: process.cwd(),
    },
  );

  proc.stdin.write(`${text}\n`, "utf8");
  proc.stdin.end();

  proc.stderr.on("data", (c: Buffer) => {
    stderr.push(c.toString("utf8"));
  });

  const code: number = await new Promise((resolve) => {
    proc.on("close", resolve);
  });

  const cleanup = () => {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  };

  if (code !== 0) {
    cleanup();
    return NextResponse.json(
      {
        error: "Piper synthesis failed",
        detail: stderr.join("").slice(0, 500),
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

  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
