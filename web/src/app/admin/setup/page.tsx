"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSetupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-org", name: orgName }),
    });
    if (res.ok) {
      router.push("/admin");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
        <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
          Create your team
        </h1>
        <p className="text-[var(--muted)] mb-6 text-sm">Set up your organization to invite employees</p>
        <form onSubmit={handleCreate} className="space-y-4">
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            required
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
