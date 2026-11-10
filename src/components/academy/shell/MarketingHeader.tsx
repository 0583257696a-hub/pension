"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoMark } from "../icons";

const LINKS = [
  { href: "/academy/courses", label: "קורסים" },
  { href: "/academy#how", label: "איך לומדים" },
  { href: "/academy/pricing", label: "מחירים" },
  { href: "/academy/faq", label: "שאלות נפוצות" },
  { href: "/academy/contact", label: "צור קשר" },
];

/** Public site header (design 01). */
export default function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1248px] items-center gap-6 px-4 sm:px-6">
        <Link href="/academy" className="flex items-center gap-2.5 text-ink">
          <LogoMark />
          <span className="text-[15px] font-bold">Pension AI Academy</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium text-subtle hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mr-auto hidden items-center gap-2 lg:flex">
          {signedIn ? (
            <Link href="/academy/dashboard" className="inline-flex h-10 items-center rounded-md bg-dark px-4 text-sm font-semibold text-white hover:bg-black">
              לקורסים שלי
            </Link>
          ) : (
            <>
              <Link href="/academy/login" className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-ink hover:bg-surface">
                התחברות
              </Link>
              <Link href="/academy/register" className="inline-flex h-10 items-center rounded-md bg-dark px-4 text-sm font-semibold text-white hover:bg-black">
                הרשמה
              </Link>
            </>
          )}
        </div>
        <button type="button" className="mr-auto inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold lg:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          תפריט
        </button>
      </div>
      {open && (
        <nav className="border-t border-line bg-white px-4 py-2 lg:hidden" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-sm font-medium text-body">
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2 border-t border-line-soft pt-3">
            {signedIn ? (
              <Link href="/academy/dashboard" className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-dark text-sm font-semibold text-white">לקורסים שלי</Link>
            ) : (
              <>
                <Link href="/academy/login" className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input text-sm font-semibold">התחברות</Link>
                <Link href="/academy/register" className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-dark text-sm font-semibold text-white">הרשמה</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
