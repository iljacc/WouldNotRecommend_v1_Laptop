import fs from "fs";
import os from "os";
import path from "path";

import { afterAll, describe, expect, test } from "vitest";

import { PiperWorkerClient } from "../src/lib/piper-worker";

describe("PiperWorkerClient", () => {
  const root = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "piper-client-test-"));
  const client = new PiperWorkerClient({
    pythonPath: path.join(root, ".venv-piper", "Scripts", "python.exe"),
    scriptPath: path.join(root, "scripts", "piper-worker.py"),
    cwd: root,
    timeoutMs: 60_000,
  });

  afterAll(async () => {
    await client.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("correlates requests and keeps one worker alive", async () => {
    const modelPath = path.join(
      root,
      "vendor",
      "piper-voices",
      "en_US-ryan-medium.onnx",
    );

    const [first, second] = await Promise.all([
      client.synthesize({
        text: "First persistent client request.",
        modelPath,
        outputPath: path.join(tempDir, "first.wav"),
        lengthScale: 1,
        sentenceSilenceMs: 300,
      }),
      client.synthesize({
        text: "Second persistent client request.",
        modelPath,
        outputPath: path.join(tempDir, "second.wav"),
        lengthScale: 1,
        sentenceSilenceMs: 300,
      }),
    ]);

    expect(first.workerPid).toBe(second.workerPid);
    expect(first.modelCacheHit).toBe(false);
    expect(second.modelCacheHit).toBe(true);
  }, 60_000);
});
