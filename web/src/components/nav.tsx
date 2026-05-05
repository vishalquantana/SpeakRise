"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home", icon: "H" },
  { href: "/history", label: "History", icon: "L" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 flex justify-around py-2 px-4 z-50">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex flex-col items-center gap-0.5 text-xs py-1 px-3 ${
            pathname === l.href ? "text-indigo-400" : "text-gray-500"
          }`}
        >
          <span className="text-lg font-bold">{l.icon}</span>
          <span>{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
