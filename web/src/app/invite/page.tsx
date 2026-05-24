"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const inviteEmail = searchParams.get("email") || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"confirm" | "otp">("confirm");
  const [error, setError] = useState("");

  async function handleSendOTP() {
    setLoading(true);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setLoading(false);
    if (res.ok) setStep("otp");
    else setError("Failed to send code.");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, code, inviteToken: token }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) router.push(data.redirect);
    else setError("Invalid or expired code.");
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
      <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
        Join Speak<span className="text-[var(--accent)]">Rise</span>
      </h1>
      <p className="text-[var(--muted)] mb-6 text-sm">You've been invited to practice English with your team</p>

      {step === "confirm" ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--foreground)]">Joining as <strong>{inviteEmail}</strong></p>
          <button
            onClick={handleSendOTP}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Sending..." : "Send verification code"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-[var(--muted)] text-sm">Code sent to {inviteEmail}</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            required
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] text-center text-2xl tracking-widest"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Verifying..." : "Join team"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
        <InviteForm />
      </Suspense>
    </div>
  );
}
