import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";

const LINKS = [
  ["/academy/admin", "סקירה"],
  ["/academy/admin/content", "תוכן ובקרה"],
  ["/academy/admin/calculator", "אימות מחשבון"],
  ["/academy/admin/ai", "מנוע תוכן (Claude)"],
  ["/academy/admin/studio", "Video Studio"],
  ["/academy/admin/users", "תלמידים ומנויים"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-black text-slate-900">פאנל ניהול הקורס</h1>
        <span className="text-xs text-slate-500">{user.email} · {user.role === "admin" ? "מנהל" : "בודק תוכן"}</span>
      </div>
      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
