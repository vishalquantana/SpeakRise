"use client";

import { useState } from "react";
import AdminNav from "@/components/admin-nav";
import EngagementTab from "@/components/engagement-tab";
import ProgressTab from "@/components/progress-tab";
import InsightsTab from "@/components/insights-tab";
import Link from "next/link";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("engagement");

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Speak<span className="text-[var(--accent)]">Rise</span>
            <span className="text-sm font-normal text-[var(--muted)] ml-2">Admin</span>
          </h1>
        </div>
        <Link
          href="/admin/team"
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[#B5502F] transition"
        >
          Manage Team
        </Link>
      </header>

      <AdminNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "engagement" && <EngagementTab />}
      {activeTab === "progress" && <ProgressTab />}
      {activeTab === "insights" && <InsightsTab />}
    </div>
  );
}
