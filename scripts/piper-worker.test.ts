import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

type WorkerResponse = {
  id: string;
  ok: boolean;
  modelCacheHit?: boolean;
  modelLoadMs?: number;
  synthesisMs?: number;
  sentenceCount?: number;
  insertedSilenceMs?: number;
  error?: string;
};

describe("persistent Piper worker", () => {
  let worker: ChildProcessWithoutNullStreams;
  let tempDir: string;
  const pending = new Map<
    string,
    { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void }
  >();

  beforeAll(() => {
    const root = process.cwd();
    const python = path.join(root, ".venv-piper", "Scripts", "python.exe");
    const script = path.join(root, "scripts", "piper-worker.py");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "piper-worker-test-"));
    worker = spawn(python, [script], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });

    readline.createInterface({ input: worker.stdout }).on("line", (line) => {
      const response = JSON.parse(line) as WorkerResponse;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      request.resolve(response);
    });

    worker.on("exit", (code) => {
      for (const request of pending.values()) {
        request.reject(new Error(`Piper worker exited with code ${code}`));
      }
      pending.clear();
    });
  });

  afterAll(() => {
    worker?.stdin.end();
    worker?.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function synthesize(id: string, outputPath: string): Promise<WorkerResponse> {
    const modelPath = path.join(
      process.cwd(),
      "vendor",
      "piper-voices",
      "en_US-ryan-medium.onnx",
    );

    return send({
      id,
      text: "Persistent Piper worker test.",
      modelPath,
      outputPath,
      lengthScale: 1,
    });
  }

  function send(request: Record<string, unknown>): Promise<WorkerResponse> {
    const id = String(request.id ?? "");
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  test("reuses a loaded voice for consecutive synthesis requests", async () => {
    const firstPath = path.join(tempDir, "first.wav");
    const secondPath = path.join(tempDir, "second.wav");

    const first = await synthesize("first", firstPath);
    const second = await synthesize("second", secondPath);

    expect(first).toMatchObject({ id: "first", ok: true, modelCacheHit: false });
    expect(first.modelLoadMs).toBeGreaterThan(0);
    expect(second).toMatchObject({ id: "second", ok: true, modelCacheHit: true });
    expect(second.modelLoadMs).toBe(0);
    expect(first.synthesisMs).toBeGreaterThan(0);
    expect(second.synthesisMs).toBeGreaterThan(0);
    expect(fs.statSync(firstPath).size).toBeGreaterThan(44);
    expect(fs.statSync(secondPath).size).toBeGreaterThan(44);
  }, 60_000);

  test("reports a bad request and remains available", async () => {
    const failed = await send({ id: "bad-request" });
    const recoveryPath = path.join(tempDir, "recovery.wav");
    const recovered = await synthesize("recovery", recoveryPath);

    expect(failed.ok).toBe(false);
    expect(failed.error).toContain("Missing synthesis text");
    expect(recovered.ok).toBe(true);
    expect(fs.statSync(recoveryPath).size).toBeGreaterThan(44);
  }, 60_000);

  test("inserts configured silence between Piper sentence chunks", async () => {
    const outputPath = path.join(tempDir, "sentence-silence.wav");
    const modelPath = path.join(
      process.cwd(),
      "vendor",
      "piper-voices",
      "en_US-ryan-medium.onnx",
    );
    const response = await send({
      id: "sentence-silence",
      text: "This is the first sentence. This is the second sentence.",
      modelPath,
      outputPath,
      lengthScale: 1,
      sentenceSilenceMs: 300,
    });

    expect(response.ok).toBe(true);
    expect(response.sentenceCount).toBe(2);
    expect(response.insertedSilenceMs).toBe(300);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(44);
  }, 60_000);
});
