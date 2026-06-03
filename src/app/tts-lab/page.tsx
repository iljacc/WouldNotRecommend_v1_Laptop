"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ReviewSample = {
  id: string;
  placeName: string;
  text: string;
  rating: number;
  authorName: string;
  source: string;
};

const PIPER_VOICES = [
  "lessac",
  "amy",
  "ryan",
  "joe",
  "hfc female",
  "norman",
  "libritts r",
];

const KOKORO_VOICES = ["af_heart", "af_bella", "af_nicole", "am_adam", "am_michael"];

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export default function TtsLabPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [reviews, setReviews] = useState<ReviewSample[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [text, setText] = useState("");
  const [engine, setEngine] = useState<"piper" | "kokoro">("piper");
  const [piperVoiceIndex, setPiperVoiceIndex] = useState(1);
  const [piperLengthScale, setPiperLengthScale] = useState(1);
  const [kokoroVoice, setKokoroVoice] = useState("af_heart");
  const [kokoroSpeed, setKokoroSpeed] = useState(1);
  const [preReadHoldMs, setPreReadHoldMs] = useState(900);
  const [subtitleLeadMs, setSubtitleLeadMs] = useState(0);
  const [lingerMs, setLingerMs] = useState(3500);
  const [revealed, setRevealed] = useState(0);
  const [status, setStatus] = useState("Loading review samples...");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/tts-lab/reviews");
        const data = (await res.json()) as { reviews?: ReviewSample[]; error?: string };
        if (cancelled) return;
        const samples = data.reviews || [];
        setReviews(samples);
        if (samples[0]) {
          setSelectedId(samples[0].id);
          setText(samples[0].text);
        }
        setStatus(samples.length ? "Ready." : data.error || "No review samples found.");
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to load samples.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearInterval(revealTimerRef.current);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedId),
    [reviews, selectedId],
  );

  const revealedText = text.slice(0, revealed);
  const hiddenText = text.slice(revealed);
  const speedLabel =
    engine === "piper"
      ? `${piperLengthScale.toFixed(2)} length scale (${piperLengthScale < 1 ? "faster" : piperLengthScale > 1 ? "slower" : "native"})`
      : `${kokoroSpeed.toFixed(2)}x`;

  const stop = () => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    audioRef.current?.pause();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    setRevealed(0);
    setStatus("Stopped.");
  };

  const play = async () => {
    stop();
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus("Add review text first.");
      return;
    }

    setStatus("Synthesizing...");
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: trimmed,
        engine,
        piperVoiceIndex,
        piperLengthScale,
        kokoroVoice,
        kokoroSpeed,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      setStatus(`TTS error: ${body.slice(0, 220)}`);
      return;
    }

    const blob = await res.blob();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = URL.createObjectURL(blob);

    const audio = new Audio(objectUrlRef.current);
    audioRef.current = audio;
    audio.onended = () => {
      setRevealed(trimmed.length);
      setStatus(`Audio ended. Subtitle lingers ${lingerMs} ms.`);
      window.setTimeout(() => setRevealed(0), lingerMs);
    };

    const beginReveal = () => {
      const durationMs = Math.max(1, audio.duration * 1000);
      const startedAt = performance.now() + subtitleLeadMs;
      revealTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        const percent = clampPercent((elapsed / durationMs) * 100);
        setRevealed(Math.floor((percent / 100) * trimmed.length));
        if (percent >= 100 && revealTimerRef.current !== null) {
          window.clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
        }
      }, 33);
    };

    setStatus(`Holding ${preReadHoldMs} ms before voice...`);
    window.setTimeout(() => {
      setStatus(`Playing ${engine} - ${speedLabel}`);
      void audio.play();
      beginReveal();
    }, preReadHoldMs);
  };

  return (
    <main className="min-h-screen bg-[#080908] px-4 py-5 font-mono text-sm text-[#d8e0d0]">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-4">
          <div>
            <h1 className="text-base text-[#f4f7ef]">TTS lab</h1>
            <p className="mt-2 text-xs leading-relaxed text-[#7c8878]">
              Audition local voices, speed, and readout timing against real one-star review samples.
            </p>
          </div>

          <label className="block text-xs text-[#9aa694]">
            Review sample
            <select
              value={selectedId}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedId(id);
                const sample = reviews.find((review) => review.id === id);
                if (sample) setText(sample.text);
              }}
              className="mt-1 w-full rounded border border-[#293328] bg-[#10130f] px-2 py-2 text-[#e8ece0]"
            >
              {reviews.map((review) => (
                <option key={review.id} value={review.id}>
                  {review.placeName} - {review.text.slice(0, 54)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 rounded border border-[#293328] bg-[#0e110d] p-3">
            <label className="text-xs text-[#9aa694]">
              Engine
              <select
                value={engine}
                onChange={(event) => setEngine(event.target.value as "piper" | "kokoro")}
                className="mt-1 w-full rounded border border-[#293328] bg-[#10130f] px-2 py-2 text-[#e8ece0]"
              >
                <option value="piper">Piper</option>
                <option value="kokoro">Kokoro</option>
              </select>
            </label>

            {engine === "piper" ? (
              <>
                <label className="text-xs text-[#9aa694]">
                  Piper voice
                  <select
                    value={piperVoiceIndex}
                    onChange={(event) => setPiperVoiceIndex(Number(event.target.value))}
                    className="mt-1 w-full rounded border border-[#293328] bg-[#10130f] px-2 py-2 text-[#e8ece0]"
                  >
                    {PIPER_VOICES.map((voice, index) => (
                      <option key={voice} value={index}>
                        {index} - {voice}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#9aa694]">
                  Length scale: {piperLengthScale.toFixed(2)}
                  <input
                    type="range"
                    min="0.65"
                    max="1.6"
                    step="0.05"
                    value={piperLengthScale}
                    onChange={(event) => setPiperLengthScale(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="text-xs text-[#9aa694]">
                  Kokoro voice
                  <select
                    value={kokoroVoice}
                    onChange={(event) => setKokoroVoice(event.target.value)}
                    className="mt-1 w-full rounded border border-[#293328] bg-[#10130f] px-2 py-2 text-[#e8ece0]"
                  >
                    {KOKORO_VOICES.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#9aa694]">
                  Speed: {kokoroSpeed.toFixed(2)}x
                  <input
                    type="range"
                    min="0.65"
                    max="1.55"
                    step="0.05"
                    value={kokoroSpeed}
                    onChange={(event) => setKokoroSpeed(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </label>
              </>
            )}
          </div>

          <div className="grid gap-3 rounded border border-[#293328] bg-[#0e110d] p-3">
            <label className="text-xs text-[#9aa694]">
              Hold before voice: {preReadHoldMs} ms
              <input
                type="range"
                min="0"
                max="4000"
                step="100"
                value={preReadHoldMs}
                onChange={(event) => setPreReadHoldMs(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs text-[#9aa694]">
              Subtitle lead/lag: {subtitleLeadMs} ms
              <input
                type="range"
                min="-1200"
                max="1200"
                step="100"
                value={subtitleLeadMs}
                onChange={(event) => setSubtitleLeadMs(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs text-[#9aa694]">
              Linger after voice: {lingerMs} ms
              <input
                type="range"
                min="0"
                max="12000"
                step="250"
                value={lingerMs}
                onChange={(event) => setLingerMs(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void play()}
              className="rounded bg-[#35573a] px-4 py-2 text-[#f5f7ef] hover:bg-[#426a48]"
            >
              Play
            </button>
            <button
              type="button"
              onClick={stop}
              className="rounded border border-[#384336] px-4 py-2 text-[#bac6b3] hover:bg-[#151a14]"
            >
              Stop
            </button>
          </div>
          <p className="text-xs text-[#7c8878]">{status}</p>
        </section>

        <section className="min-h-[70vh] border border-[#293328] bg-[#0d100d] p-5">
          <div className="mb-4 text-xs uppercase tracking-wide text-[#697566]">
            Readout preview
          </div>
          {selectedReview ? (
            <div className="mb-4 text-xs text-[#84907f]">
              {selectedReview.placeName} / {selectedReview.rating} star / {selectedReview.authorName || "unknown"}
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setRevealed(0);
            }}
            className="h-44 w-full resize-none rounded border border-[#293328] bg-[#080908] p-3 text-[#e8ece0] outline-none focus:border-[#53624f]"
          />

          <div className="mt-8 min-h-52 border-t border-[#293328] pt-8 text-2xl leading-relaxed text-[#edf3e8]">
            <span>{revealedText}</span>
            <span className="text-[#556050]">{hiddenText}</span>
          </div>

          <div className="mt-8 grid gap-2 text-xs text-[#7c8878] sm:grid-cols-2">
            <div>Engine: {engine}</div>
            <div>Speed: {speedLabel}</div>
            <div>Hold: {preReadHoldMs} ms</div>
            <div>Linger: {lingerMs} ms</div>
          </div>
        </section>
      </div>
    </main>
  );
}
