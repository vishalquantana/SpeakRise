"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const employeeLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/leaderboard", label: "Ranks" },
  { href: "/levels", label: "Levels" },
  { href: "/history", label: "History" },
];

const adminLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/admin", label: "Admin" },
  { href: "/leaderboard", label: "Ranks" },
  { href: "/history", label: "History" },
];

export default function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--card-border)] flex justify-around py-3 px-4 z-50">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex flex-col items-center gap-0.5 text-xs py-1 px-3 transition ${
            pathname === l.href || pathname.startsWith(l.href + "/")
              ? "text-[var(--accent)] font-medium"
              : "text-[var(--muted)]"
          }`}
        >
          <span>{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
