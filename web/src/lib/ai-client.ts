const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function transcribeAudio(audioBlob: Blob): Promise<{ text: string; language: string }> {
  const form = new FormData();
  form.append("audio", audioBlob, "recording.webm");
  const res = await fetch(`${AI_URL}/transcribe`, { method: "POST", body: form });
  return res.json();
}

export async function chat(
  text: string,
  sessionId: string,
  systemPrompt?: string
): Promise<{ text: string }> {
  const res = await fetch(`${AI_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId, system_prompt: systemPrompt }),
  });
  return res.json();
}

export async function speakStream(text: string, voice: string): Promise<Response> {
  return fetch(`${AI_URL}/speak-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
}
