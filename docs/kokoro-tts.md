# Kokoro TTS

The app can use Kokoro for local text-to-speech through `/api/tts`, but Piper is the default engine for lower startup latency.

## Install

Kokoro is installed into a project-local Python virtual environment:

```powershell
python -m venv .venv-kokoro
.\.venv-kokoro\Scripts\python.exe -m pip install --upgrade pip
.\.venv-kokoro\Scripts\python.exe -m pip install "kokoro>=0.9.4" soundfile
```

The first synthesis downloads the Kokoro model/voice files into the Hugging Face cache for the current Windows user.

## Runtime settings

Configured in `.env.local`:

```env
TTS_ENGINE=piper
KOKORO_VOICE=af_heart
KOKORO_LANG=a
KOKORO_SPEED=1
```

Useful Kokoro settings:

| Setting | Meaning |
| --- | --- |
| `KOKORO_VOICE` | Voice id passed to Kokoro, currently `af_heart`. |
| `KOKORO_LANG` | Language code. `a` is American English; `b` is British English. |
| `KOKORO_SPEED` | Speech speed. `1` is normal; lower is slower, higher is faster. |
| `TTS_ENGINE` | `piper` by default. Set `kokoro` to use Kokoro instead. |

## Implementation

`src/app/api/tts/route.ts` spawns:

```text
.venv-kokoro\Scripts\python.exe scripts\kokoro-synth.py
```

The helper script writes a temporary WAV file and the route returns it to the browser as `audio/wav`.

Kokoro still starts a new Python process per review. Piper uses a separate persistent worker that keeps its ONNX voice loaded; this optimization does not currently apply to Kokoro.
