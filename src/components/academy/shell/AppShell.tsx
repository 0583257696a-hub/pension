import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/academy/auth/types";
import { isStaff } from "@/academy/auth/service";
import type { Entitlement } from "@/academy/billing/entitlements";
import { LogoMark } from "../icons";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import UserMenu from "./UserMenu";

export function planBadge(entitlement: Entitlement | null): { text: string; tone: "green" | "blue" | "amber" | "slate" } {
  switch (entitlement?.reason) {
    case "staff":
      return { text: "גישת צוות", tone: "blue" };
    case "active":
      return { text: "מנוי פעיל", tone: "green" };
    case "trial":
      return { text: "תקופת ניסיון", tone: "green" };
    case "canceled_until_period_end":
      return { text: "המנוי בוטל", tone: "amber" };
    case "expired":
      return { text: "המנוי הסתיים", tone: "amber" };
    default:
      return { text: "חשבון חינמי", tone: "slate" };
  }
}

const badgeTones = {
  green: "bg-success-soft text-success-ink",
  blue: "bg-accent-soft text-accent-hover",
  amber: "bg-warn-soft text-warn-ink",
  slate: "bg-line-soft text-subtle",
};

/** Student app frame: top bar + right sidebar (design 02 · 04). */
export default function AppShell({ user, courseTitle, entitlement, breadcrumb, children }: {
  user: User; courseTitle?: string | null; entitlement: Entitlement | null; breadcrumb?: ReactNode; children: ReactNode;
}) {
  const plan = planBadge(entitlement);
  const staff = isStaff(user);
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
          <Link href="/academy/dashboard" className="flex shrink-0 items-center gap-2.5 text-ink lg:w-[224px]">
            <LogoMark />
            <span className="hidden text-[15px] font-bold sm:inline">Pension AI Academy</span>
          </Link>
          {breadcrumb && <div className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">{breadcrumb}</div>}
          <div className="mr-auto flex items-center gap-3">
            {courseTitle && <span className="hidden rounded-md border border-line px-2.5 py-1.5 text-[13px] text-body xl:inline">{courseTitle}</span>}
            <Link href="/academy/account" className={`hidden rounded-md px-2 py-1.5 text-xs font-semibold sm:inline ${badgeTones[plan.tone]}`}>{plan.text}</Link>
            <MobileNav isStaff={staff} />
            <UserMenu name={user.full_name} email={user.email} />
          </div>
        </div>
      </header>
      <div className="flex items-start">
        <AppSidebar isStaff={staff} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10 lg:px-12">{children}</main>
      </div>
    </div>
  );
}
