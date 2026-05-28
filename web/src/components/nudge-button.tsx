"use client";

import { useState } from "react";

const SKILLS = [
  "grammar",
  "vocabulary",
  "fluency",
  "clarity",
  "sentence_variety",
  "rhetoric",
  "narrative",
  "delivery",
];

export default function NudgeButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSending(true);
    await fetch("/api/admin/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toUserId: userId,
        targetSkill: skill || undefined,
        message: message || undefined,
        sendEmail,
      }),
    });
    setSending(false);
    setDone(true);
    setOpen(false);
  }

  if (done) {
    return <span className="text-xs text-[var(--success)]">Nudge sent</span>;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[#B5502F] transition"
      >
        Nudge
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="font-semibold text-[var(--foreground)]">Nudge {name}</h3>
            <label className="block text-sm text-[var(--muted)]">Focus skill</label>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="w-full border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Let the app choose</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <label className="block text-sm text-[var(--muted)]">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
              placeholder="Keep it up - try this one next."
            />
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Also send an email
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setOpen(false)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                disabled={sending}
                onClick={submit}
                className="text-sm px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send nudge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
