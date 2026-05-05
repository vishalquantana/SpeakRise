import asyncio
import base64
import io
import json
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor

import httpx
import numpy as np
import soundfile as sf
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

app = FastAPI()

# Load models at startup
print("Loading Whisper model (small)...")
whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
print("Whisper loaded.")

MODEL_DIR = os.path.dirname(__file__)
KOKORO_MODEL = os.path.join(MODEL_DIR, "kokoro-v1.0.onnx")
KOKORO_VOICES = os.path.join(MODEL_DIR, "voices-v1.0.bin")

print("Loading Kokoro TTS...")
kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
print("Kokoro loaded. Voices:", kokoro.get_voices()[:5], "...")

# Thread pool for parallel TTS synthesis
tts_executor = ThreadPoolExecutor(max_workers=4)

# Conversation history (in-memory)
conversations: dict[str, list[dict]] = {}

SYSTEM_PROMPT = """You are a friendly English conversation partner helping someone practice and improve their English speaking skills.

Rules:
- Keep responses concise (2-3 sentences max) so the conversation flows naturally
- Speak naturally like a friend, not a teacher
- NEVER use emojis, emoticons, or special symbols in your responses. Your text will be read aloud by a TTS engine.
- If the user makes grammar mistakes, gently model the correct form in your response without explicitly correcting them
- Ask follow-up questions to keep the conversation going
- Adapt to the user's level - use simpler language if they seem to be a beginner
- Be encouraging and positive
- Vary topics: daily life, hobbies, travel, food, work, culture"""


def split_sentences(text: str) -> list[str]:
    """Split text into sentences, keeping punctuation attached."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def synthesize_sentence(text: str, voice: str, speed: float) -> bytes:
    """Synthesize a single sentence to WAV bytes (runs in thread pool)."""
    samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    return buf.getvalue()


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = os.path.join(MODEL_DIR, "static", "index.html")
    with open(html_path) as f:
        return f.read()


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        segments, info = whisper_model.transcribe(tmp_path, beam_size=5)
        text = " ".join(seg.text for seg in segments).strip()
        return {"text": text, "language": info.language}
    finally:
        os.unlink(tmp_path)


@app.post("/chat")
async def chat(request: dict):
    session_id = request.get("session_id", "default")
    user_text = request["text"]

    if session_id not in conversations:
        conversations[session_id] = []

    conversations[session_id].append({"role": "user", "content": user_text})
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversations[session_id][-20:]

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={"model": "deepseek-v4-flash", "messages": messages, "stream": False},
        )
        data = resp.json()
        assistant_text = data["choices"][0]["message"]["content"]

    conversations[session_id].append({"role": "assistant", "content": assistant_text})
    return {"text": assistant_text}


@app.post("/speak")
async def speak(request: dict):
    text = request["text"]
    voice = request.get("voice", "af_sarah")
    speed = request.get("speed", 1.0)

    samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    buf.seek(0)
    return Response(content=buf.read(), media_type="audio/wav")


@app.post("/speak-stream")
async def speak_stream(request: dict):
    """Stream TTS sentence by sentence via SSE.

    Splits text into sentences, synthesizes all in parallel,
    and streams each as a base64 WAV chunk via Server-Sent Events
    in sentence order as they complete.
    """
    text = request["text"]
    voice = request.get("voice", "af_sarah")
    speed = request.get("speed", 1.0)

    sentences = split_sentences(text)
    if not sentences:
        sentences = [text]

    loop = asyncio.get_event_loop()

    # Launch all sentences in parallel via thread pool
    futures = [
        loop.run_in_executor(tts_executor, synthesize_sentence, s, voice, speed)
        for s in sentences
    ]

    async def event_generator():
        # Yield each sentence's audio in order as it completes
        for i, future in enumerate(futures):
            wav_bytes = await future
            b64 = base64.b64encode(wav_bytes).decode("ascii")
            data = json.dumps({
                "index": i,
                "total": len(sentences),
                "sentence": sentences[i],
                "audio": b64,
            })
            yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/voices")
async def list_voices():
    return kokoro.get_voices()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8770)
