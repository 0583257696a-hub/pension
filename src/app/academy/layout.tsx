import type { Metadata, Viewport } from "next";
import "./academy.css";

export const metadata: Metadata = {
  title: "Pension AI Academy | מימון וסטטיסטיקה",
  description: "הכנה למבחני הרישוי בייעוץ פנסיוני: שיעורים, תרגול, פתרון במחשבון הפיננסי ומורה AI.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Base wrapper. Each route group adds its own frame (site, app, lesson player, admin). */
export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="he" className="academy-root min-h-screen w-full bg-white text-ink">
      {children}
    </div>
  );
}
