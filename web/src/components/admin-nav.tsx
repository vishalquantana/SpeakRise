"use client";

interface AdminNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "engagement", label: "Engagement" },
  { id: "progress", label: "Progress" },
  { id: "insights", label: "Work Insights" },
];

export default function AdminNav({ activeTab, onTabChange }: AdminNavProps) {
  return (
    <div className="flex border-b border-[var(--card-border)] mx-6 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-sm font-medium text-center transition border-b-2 ${
            activeTab === tab.id
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
