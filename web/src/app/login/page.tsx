"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get("test_mode") === "true";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(testMode ? "123456" : "");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, testMode }),
    });

    setLoading(false);
    if (res.ok) {
      setStep("otp");
    } else {
      setError("Failed to send code. Try again.");
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, testMode }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push(data.redirect);
    } else {
      setError("Invalid or expired code.");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
        <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">
          Speak<span className="text-[var(--accent)]">Rise</span>
        </h1>
        <p className="text-[var(--muted)] mb-8">Practice English, level up your speaking</p>

        {testMode && (
          <div className="mb-4 p-2 bg-[var(--gold-light)] border border-[var(--gold)] rounded-lg text-[var(--gold)] text-xs text-center">
            Test mode — any email, code 123456
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
            >
              {loading ? "Sending..." : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <p className="text-[var(--muted)] text-sm">Code sent to {email}</p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              required
              className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)] text-center text-2xl tracking-widest"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
            >
              {loading ? "Verifying..." : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(testMode ? "123456" : ""); setError(""); }}
              className="w-full py-2 text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Suspense fallback={
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
            <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">
              Speak<span className="text-[var(--accent)]">Rise</span>
            </h1>
            <p className="text-[var(--muted)] mb-8">Loading...</p>
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
