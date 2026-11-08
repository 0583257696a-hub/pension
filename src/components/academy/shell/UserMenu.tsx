"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "../LogoutButton";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  if (parts.length === 1) return parts[0].slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

/** Avatar square with a small menu (account, logout). */
export default function UserMenu({ name, email, dark = false }: { name: string; email: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`פרופיל: ${name || email}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold ${dark ? "bg-accent-soft text-accent" : "bg-dark text-white"}`}
      >
        {initials(name, email)}
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-50 w-56 rounded-xl border border-line bg-white p-2 shadow-lg">
          <div className="border-b border-line-soft px-3 pb-2 pt-1">
            <div className="truncate text-sm font-semibold text-ink">{name || "משתמש"}</div>
            <div className="ltr truncate text-start text-xs text-muted">{email}</div>
          </div>
          <Link href="/academy/account" onClick={() => setOpen(false)} className="mt-1 block rounded-md px-3 py-2 text-sm text-body hover:bg-surface">
            החשבון שלי
          </Link>
          <LogoutButton className="block w-full rounded-md px-3 py-2 text-start text-sm text-body hover:bg-surface" />
        </div>
      )}
    </div>
  );
}
