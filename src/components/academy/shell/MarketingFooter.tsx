import Link from "next/link";
import { LogoMark } from "../icons";

/** Dark site footer (design 01). */
export default function MarketingFooter() {
  return (
    <footer className="bg-dark text-white">
      <div className="mx-auto grid max-w-[1248px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-white/10 p-0.5"><LogoMark size={28} /></span>
            <span className="font-bold">Pension AI Academy</span>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-faint">פלטפורמה ללימודי ייעוץ פנסיוני לקראת מבחני הרישוי. כל פתרון נבדק מקצועית לפני פרסום.</p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-semibold">לימודים</span>
          <Link href="/academy/course" className="text-faint hover:text-white">תוכנית הלימודים</Link>
          <Link href="/academy#how" className="text-faint hover:text-white">איך זה עובד</Link>
          <Link href="/academy#pricing" className="text-faint hover:text-white">מחירים</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="mb-1 font-semibold">חשבון</span>
          <Link href="/academy/login" className="text-faint hover:text-white">התחברות</Link>
          <Link href="/academy/register" className="text-faint hover:text-white">הרשמה</Link>
          <Link href="/academy#faq" className="text-faint hover:text-white">שאלות נפוצות</Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1248px] px-4 py-5 text-xs text-faint sm:px-6">© Pension AI Academy · המחשבון הפיננסי של הקורס: CASIO FC-200V</div>
      </div>
    </footer>
  );
}
