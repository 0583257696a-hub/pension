"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LogoutButton from "./LogoutButton";

interface NavUser {
  name: string;
  role: "student" | "reviewer" | "admin";
}

/** Top navigation. One item per area; there is no separate combinatorics area (it lives inside the course). */
export default function AcademyNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = user
    ? [
        { href: "/academy/dashboard", label: "הדשבורד שלי" },
        { href: "/academy/course", label: "תוכנית הלימודים" },
        { href: "/academy/account", label: "המנוי שלי" },
        ...(user.role !== "student" ? [{ href: "/academy/admin", label: "ניהול" }] : []),
      ]
    : [{ href: "/academy/course", label: "תוכנית הלימודים" }];
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/academy" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white">AI</span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold text-slate-900">AI Pension Academy</span>
            <span className="block text-xs text-slate-500">מימון וסטטיסטיקה</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-2 text-sm font-semibold ${active(l.href) ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <LogoutButton className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50" />
          ) : (
            <>
              <Link href="/academy/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">כניסה</Link>
              <Link href="/academy/register" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">הרשמה</Link>
            </>
          )}
        </nav>
        <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold md:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          תפריט
        </button>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 text-sm font-semibold ${active(l.href) ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <LogoutButton className="block w-full rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-slate-500" />
          ) : (
            <>
              <Link href="/academy/login" className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700">כניסה</Link>
              <Link href="/academy/register" className="block rounded-lg px-3 py-2.5 text-sm font-bold text-brand-700">הרשמה</Link>
            </>
          )}
        </nav>
      )}
      {user && user.role !== "student" && (
        <div className="bg-violet-50 px-4 py-1 text-center text-xs font-semibold text-violet-800">
          מחובר כ{user.role === "admin" ? "מנהל" : "בודק תוכן"}. אתה רואה גם תוכן שעדיין לא פורסם.
        </div>
      )}
    </header>
  );
}
