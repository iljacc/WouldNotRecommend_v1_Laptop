import { randomUUID } from "crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";

export type PiperWorkerSynthesisRequest = {
  text: string;
  modelPath: string;
  outputPath: string;
  lengthScale: number | null;
};

export type PiperWorkerSynthesisResult = {
  workerPid: number;
  modelCacheHit: boolean;
  modelLoadMs: number;
  synthesisMs: number;
  totalMs: number;
};

type PiperWorkerResponse = PiperWorkerSynthesisResult & {
  id: string;
  ok: boolean;
  error?: string;
  traceback?: string;
};

type PendingRequest = {
  resolve: (result: PiperWorkerSynthesisResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type PiperWorkerClientOptions = {
  pythonPath: string;
  scriptPath: string;
  cwd: string;
  timeoutMs?: number;
};

const MAX_STDERR_CHARS = 20_000;

export class PiperWorkerClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private stderr = "";
  private closing = false;

  constructor(private readonly options: PiperWorkerClientOptions) {}

  synthesize(request: PiperWorkerSynthesisRequest): Promise<PiperWorkerSynthesisResult> {
    const proc = this.ensureProcess();
    const id = randomUUID();
    const timeoutMs = this.options.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Piper worker timed out after ${timeoutMs}ms`));
        this.stopProcess();
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      proc.stdin.write(`${JSON.stringify({ id, ...request })}\n`, "utf8", (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    const proc = this.process;
    if (!proc) return;

    await new Promise<void>((resolve) => {
      const forceClose = setTimeout(() => {
        proc.kill();
        resolve();
      }, 2_000);
      proc.once("exit", () => {
        clearTimeout(forceClose);
        resolve();
      });
      proc.stdin.end();
    });
    this.process = null;
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) return this.process;

    this.closing = false;
    this.stderr = "";
    const proc = spawn(this.options.pythonPath, [this.options.scriptPath], {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = proc;

    readline.createInterface({ input: proc.stdout }).on("line", (line) => {
      this.handleResponse(line);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-MAX_STDERR_CHARS);
    });
    proc.on("error", (error) => {
      this.handleProcessFailure(proc, error);
    });
    proc.on("exit", (code, signal) => {
      if (this.closing) return;
      this.handleProcessFailure(
        proc,
        new Error(
          `Piper worker exited (code=${code ?? "null"}, signal=${signal ?? "none"})${
            this.stderr ? `\n${this.stderr}` : ""
          }`,
        ),
      );
    });

    return proc;
  }

  private handleResponse(line: string): void {
    let response: PiperWorkerResponse;
    try {
      response = JSON.parse(line) as PiperWorkerResponse;
    } catch {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (!response.ok) {
      pending.reject(
        new Error(response.traceback || response.error || "Piper worker synthesis failed"),
      );
      return;
    }

    pending.resolve({
      workerPid: response.workerPid,
      modelCacheHit: response.modelCacheHit,
      modelLoadMs: response.modelLoadMs,
      synthesisMs: response.synthesisMs,
      totalMs: response.totalMs,
    });
  }

  private stopProcess(): void {
    const proc = this.process;
    if (!proc) return;
    proc.kill();
    this.process = null;
  }

  private handleProcessFailure(
    proc: ChildProcessWithoutNullStreams,
    error: Error,
  ): void {
    if (this.process !== proc) return;
    this.process = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

type PiperWorkerGlobal = typeof globalThis & {
  __wouldNotRecommendPiperWorker?: PiperWorkerClient;
};

export function getPiperWorkerClient(
  options: PiperWorkerClientOptions,
): PiperWorkerClient {
  const workerGlobal = globalThis as PiperWorkerGlobal;
  workerGlobal.__wouldNotRecommendPiperWorker ??= new PiperWorkerClient(options);
  return workerGlobal.__wouldNotRecommendPiperWorker;
}
