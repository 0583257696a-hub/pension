"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconCalendar, IconCheckSquare, IconGrid, IconSettings, IconTimer, IconUser } from "../icons";

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
  match?: string[];
}

/** Student navigation (design 02/04). Only areas that exist in the product. */
export function studentNav(isStaff: boolean): Item[] {
  return [
    { href: "/academy/dashboard", label: "לוח הבקרה", icon: <IconGrid /> },
    { href: "/academy/course", label: "תוכנית הלימודים", icon: <IconCalendar />, match: ["/academy/course"] },
    { href: "/academy/practice", label: "תרגול שאלות", icon: <IconCheckSquare />, match: ["/academy/practice"] },
    { href: "/academy/exams", label: "מבחנים וסימולציות", icon: <IconTimer />, match: ["/academy/exams", "/academy/quiz"] },
    { href: "/academy/account", label: "החשבון שלי", icon: <IconUser /> },
    ...(isStaff ? [{ href: "/academy/admin", label: "ניהול הקורס", icon: <IconSettings /> }] : []),
  ];
}

export function NavList({ items, onNavigate }: { items: Item[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (item: Item) => pathname === item.href || (item.match ?? []).some((m) => pathname.startsWith(m));
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-[42px] items-center gap-3 rounded-md px-3 text-[15px] ${active ? "bg-line-soft font-semibold text-ink" : "text-subtle hover:bg-surface hover:text-ink"}`}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function AppSidebar({ isStaff }: { isStaff: boolean }) {
  return (
    <nav aria-label="תפריט תלמיד" className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[248px] shrink-0 border-l border-line bg-white px-4 py-5 lg:block">
      <NavList items={studentNav(isStaff)} />
    </nav>
  );
}
