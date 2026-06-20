"""Persistent JSON-lines Piper synthesis worker.

Each stdin line is a request containing an id, text, model path, output path,
and optional length scale. Each stdout line is the matching JSON response.
Loaded voices remain cached for the lifetime of this process.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import time
import traceback
import wave

from piper import PiperVoice, SynthesisConfig


VOICES: dict[str, PiperVoice] = {}


def elapsed_ms(start: float) -> int:
    return max(0, round((time.perf_counter() - start) * 1000))


def synthesize(request: dict[str, object]) -> dict[str, object]:
    request_id = str(request.get("id", ""))
    text = str(request.get("text", "")).strip()
    model_path = str(request.get("modelPath", ""))
    output_path = str(request.get("outputPath", ""))
    length_scale_value = request.get("lengthScale")

    if not request_id:
        raise ValueError("Missing request id")
    if not text:
        raise ValueError("Missing synthesis text")
    if not model_path:
        raise ValueError("Missing Piper model path")
    if not output_path:
        raise ValueError("Missing output path")

    total_started = time.perf_counter()
    resolved_model_path = str(Path(model_path).resolve())
    voice = VOICES.get(resolved_model_path)
    model_cache_hit = voice is not None
    model_load_ms = 0

    if voice is None:
        model_started = time.perf_counter()
        voice = PiperVoice.load(resolved_model_path)
        model_load_ms = elapsed_ms(model_started)
        VOICES[resolved_model_path] = voice

    length_scale = (
        float(length_scale_value) if length_scale_value is not None else None
    )
    synthesis_config = SynthesisConfig(length_scale=length_scale)
    synthesis_started = time.perf_counter()
    wav_params_set = False
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        with wave.open(str(output), "wb") as wav_file:
            for audio_chunk in voice.synthesize(text, synthesis_config):
                if not wav_params_set:
                    wav_file.setframerate(audio_chunk.sample_rate)
                    wav_file.setsampwidth(audio_chunk.sample_width)
                    wav_file.setnchannels(audio_chunk.sample_channels)
                    wav_params_set = True
                wav_file.writeframes(audio_chunk.audio_int16_bytes)

        if not wav_params_set:
            raise RuntimeError("Piper produced no audio chunks")
    except Exception:
        output.unlink(missing_ok=True)
        raise

    return {
        "id": request_id,
        "ok": True,
        "workerPid": os.getpid(),
        "modelCacheHit": model_cache_hit,
        "modelLoadMs": model_load_ms,
        "synthesisMs": elapsed_ms(synthesis_started),
        "totalMs": elapsed_ms(total_started),
    }


def respond(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = ""
        try:
            request = json.loads(line)
            request_id = str(request.get("id", ""))
            respond(synthesize(request))
        except Exception as error:
            respond(
                {
                    "id": request_id,
                    "ok": False,
                    "workerPid": os.getpid(),
                    "error": str(error),
                    "traceback": traceback.format_exc(),
                }
            )


if __name__ == "__main__":
    main()
