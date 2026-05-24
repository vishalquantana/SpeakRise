"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Member {
  id: string;
  email: string;
  name: string | null;
  current_level: number;
  role: string;
  joined_at: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/team").then(r => r.json()).then(d => setMembers(d.members || []));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage("");
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSending(false);
    if (res.ok) {
      setMessage(`Invite sent to ${email}`);
      setEmail("");
    } else {
      setMessage("Failed to send invite.");
    }
  }

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/admin" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">Team Management</h1>
      </header>

      <div className="mx-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Invite Employee</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="employee@company.com"
            required
            className="flex-1 px-4 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--foreground)] placeholder-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-medium text-white text-sm transition"
          >
            {sending ? "..." : "Invite"}
          </button>
        </form>
        {message && <p className="text-sm text-[var(--success)] mt-2">{message}</p>}
      </div>

      <div className="mx-6 mt-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Team ({members.length})</h2>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {members.map((m) => (
            <div key={m.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{m.name || m.email}</p>
                <p className="text-xs text-[var(--muted)]">{m.role} · L{m.current_level}</p>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "pending"}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div className="px-4 py-6 text-center text-[var(--muted)] text-sm">
              No team members yet. Invite someone above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
