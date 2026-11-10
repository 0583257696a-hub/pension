import type { SeedCourse } from "./types";
import { chapters } from "./chapters";
import { lesson01 } from "./lessons/lesson-01";
import { lesson02 } from "./lessons/lesson-02";
import { lesson03 } from "./lessons/lesson-03";
import { financeOutlines, investmentOutlines, statisticsOutlines } from "./lessons/outlines";

export const COURSE_ID = "crs_finance_stats";

/**
 * "מימון וסטטיסטיקה": 14 academic chapters in three parts, taught in numbered
 * lessons. Lesson 1 is the first complete vertical slice; the rest are drafts
 * that go through the AI Content Factory and review before publication.
 */
export const financeStatisticsCourse: SeedCourse = {
  id: COURSE_ID,
  slug: "finance-statistics",
  title: "מימון וסטטיסטיקה",
  subtitle: "הכנה למבחן הרישוי, עם פתרון כל שאלה במחשבון הפיננסי",
  description:
    "קורס מסודר בשיעורים ממוספרים: בכל שיעור סרטון, שאלות השיעור ודף נוסחאות להורדה, ומטלה של 20 שאלות עם פתרון קבוע וסרטון הסבר קצר לכל שאלה. כל פתרון מוצג קודם במחשבון הפיננסי, ואחריו בנוסחה.",
  priceIls: 149,
  trialDays: 0,
  calculatorModel: "casio-fc-200v",
  chapters,
  plans: [
    { id: "plan_fs_monthly", kind: "monthly", title: "מנוי חודשי", priceAgorot: 14900 },
    { id: "plan_fs_annual", kind: "annual", title: "מנוי שנתי", priceAgorot: 119000 },
    { id: "plan_fs_once", kind: "one_time", title: "רכישה חד-פעמית, גישה ל-6 חודשים", priceAgorot: 59000, accessDays: 183 },
  ],
  units: [
    {
      id: "unit_tvm",
      slug: "finance",
      title: "חלק א׳: מימון",
      description: "ריביות, הלוואות, הצמדה, תזרימים, אגרות חוב וכדאיות פרויקטים.",
      status: "published",
      lessons: [lesson01, lesson02, lesson03, ...financeOutlines],
    },
    {
      id: "unit_statistics",
      slug: "statistics",
      title: "חלק ב׳: סטטיסטיקה",
      description: "קומבינטוריקה, הסתברות, מדדים, התפלגויות ושני משתנים.",
      status: "draft",
      lessons: statisticsOutlines,
    },
    {
      id: "unit_investments",
      slug: "investments",
      title: "חלק ג׳: השקעות",
      description: "נכסים מסוכנים, תיק השקעות ומודל CAPM.",
      status: "draft",
      lessons: investmentOutlines,
    },
  ],
};

/** Bump when the built-in content changes, so existing databases re-import it (in review status). */
export const CONTENT_VERSION = "2026-11-10.master-v1";
