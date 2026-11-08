import type { Metadata, Viewport } from "next";
import "./academy.css";
import AcademyNav from "@/components/academy/AcademyNav";
import { getCurrentUser } from "@/academy/auth/session";

export const metadata: Metadata = {
  title: "AI Pension Academy | מימון וסטטיסטיקה",
  description: "קורס מימון וסטטיסטיקה לייעוץ פנסיוני. הפתרון במחשבון הפיננסי קודם.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div dir="rtl" lang="he" className="academy-root min-h-screen w-full bg-slate-50 text-slate-900">
      <AcademyNav user={user ? { name: user.full_name, role: user.role } : null} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        AI Pension Academy · התכנים עוברים בדיקה מקצועית לפני פרסום · המחשבון הפיננסי של הקורס: CASIO FC-200V
      </footer>
    </div>
  );
}
