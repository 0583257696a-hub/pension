"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoMark } from "../icons";
import UserMenu from "./UserMenu";

const SECTIONS: Array<{ title?: string; items: Array<{ href: string; label: string; exact?: boolean }> }> = [
  { items: [{ href: "/academy/admin", label: "סקירה כללית", exact: true }] },
  {
    title: "קורס ולמידה",
    items: [
      { href: "/academy/admin/content", label: "שיעורים ומאגר שאלות" },
      { href: "/academy/admin/assignments", label: "מטלות" },
      { href: "/academy/admin/materials", label: "קובצי PDF" },
    ],
  },
  {
    title: "הפקת תוכן",
    items: [
      { href: "/academy/admin/ai", label: "AI Content Factory" },
      { href: "/academy/admin/studio", label: "הפקת סרטונים" },
      { href: "/academy/admin/calculator", label: "אימות מחשבון" },
    ],
  },
  {
    title: "תלמידים ומסחר",
    items: [
      { href: "/academy/admin/support", label: "פניות תלמידים" },
      { href: "/academy/admin/users", label: "תלמידים וגישה" },
      { href: "/academy/admin/billing", label: "מסלולים ותשלומים" },
    ],
  },
];

/** Admin frame with the dark sidebar (design 05). */
export default function AdminShell({ name, email, role, counts, children }: {
  name: string; email: string; role: "admin" | "reviewer"; counts: Record<string, number>; children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const nav = (
    <nav aria-label="תפריט ניהול" className="flex flex-col gap-6">
      {SECTIONS.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title && <span className="mb-1 px-3 text-xs text-faint">{section.title}</span>}
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active(item.href, item.exact) ? "page" : undefined}
              className={`flex h-10 items-center justify-between rounded-md px-3 text-[15px] ${active(item.href, item.exact) ? "bg-white/10 font-semibold text-white" : "text-[#D0D5DD] hover:bg-white/5 hover:text-white"}`}
            >
              {item.label}
              {counts[item.href] ? (
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${item.href.endsWith("content") || item.href.endsWith("support") ? "bg-[#7A2E0E] text-[#FEDF89]" : "bg-[#3730A3] text-[#E0E7FF]"}`}>{counts[item.href]}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
      <Link href="/academy/dashboard" className="px-3 text-sm text-faint hover:text-white">← לאזור התלמיד</Link>
    </nav>
  );
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col gap-8 bg-dark px-3 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-3">
          <span className="rounded-md bg-white p-0.5"><span className="block"><LogoMark size={26} /></span></span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold text-white">Pension AI Academy</span>
            <span className="block text-xs text-faint">ממשק ניהול</span>
          </span>
        </div>
        {nav}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-8">
          <button type="button" className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold lg:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            תפריט
          </button>
          <span className="text-sm text-muted">{role === "admin" ? "מנהל" : "בודק תוכן"}</span>
          <div className="mr-auto">
            <UserMenu name={name} email={email} dark />
          </div>
        </header>
        {open && <div className="border-b border-line bg-dark px-4 py-4 lg:hidden">{nav}</div>}
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
