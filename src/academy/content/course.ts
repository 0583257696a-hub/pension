import type { SeedCourse } from "./types";
import { unit1 } from "./unit1-time-value";
import { plannedUnits } from "./planned-units";

export const COURSE_ID = "crs_finance_stats";

export const financeStatisticsCourse: SeedCourse = {
  id: COURSE_ID,
  slug: "finance-statistics",
  title: "מימון וסטטיסטיקה ליועצים פנסיוניים",
  subtitle: "הכנה למבחן הרישוי, עם פתרון כל שאלה במחשבון הפיננסי",
  description:
    "קורס מעשי שמלמד לפתור את שאלות המימון והסטטיסטיקה של מבחני הרישוי במהירות ובביטחון. בכל שאלה מוצגת קודם דרך הפתרון במחשבון הפיננסי, ואחריה ההסבר בנוסחה.",
  priceIls: 149,
  trialDays: 7,
  calculatorModel: "casio-fc-200v",
  units: [unit1, ...plannedUnits],
};
