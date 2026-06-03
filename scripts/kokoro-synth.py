import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthesize a WAV file with Kokoro.")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--lang", default="a")
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit("No text to synthesize")

    pipeline = KPipeline(lang_code=args.lang)
    chunks = []
    for _graphemes, _phonemes, audio in pipeline(
        text,
        voice=args.voice,
        speed=args.speed,
        split_pattern=r"\n+",
    ):
        chunks.append(audio)

    if not chunks:
        raise SystemExit("Kokoro produced no audio")

    combined = chunks[0] if len(chunks) == 1 else np.concatenate(chunks)
    sf.write(args.output_file, combined, 24000)


if __name__ == "__main__":
    main()
