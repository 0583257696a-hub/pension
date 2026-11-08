import type { SeedLesson, SeedUnit } from "./types";

/**
 * Units after Unit 1 are outlines (status "draft") until Unit 1 has run end to
 * end with students. They use exactly the same lesson / question / quiz /
 * video components. Combinatorics is part of Statistics & Probability, not a
 * separate module.
 */
function outline(id: string, slug: string, title: string, description: string, objectives: string[], extra: Partial<SeedLesson> = {}): SeedLesson {
  return {
    id,
    slug,
    title,
    description,
    access: "paid",
    status: "draft",
    minutes: 25,
    objectives,
    summary: "",
    formulas: [],
    examples: [],
    questions: [],
    ...extra,
  };
}

export const plannedUnits: SeedUnit[] = [
  {
    id: "unit_cashflows",
    slug: "cash-flows",
    title: "יחידה 2: תזרימי מזומנים, NPV ו-IRR",
    description: "הערכת השקעות וסדרות תזרימים לא אחידות במצב CASH.",
    status: "draft",
    lessons: [
      outline("lsn_cf_npv", "npv", "ערך נוכחי נקי (NPV)", "היוון סדרת תזרימים לא אחידה וקבלת החלטות השקעה.", ["לחשב NPV במצב CASH", "לפרש NPV חיובי ושלילי"]),
      outline("lsn_cf_irr", "irr", "שיעור תשואה פנימי (IRR)", "התשואה שמאפסת את ה-NPV.", ["לחשב IRR במצב CASH", "להשוות IRR לשיעור היוון"]),
    ],
  },
  {
    id: "unit_loans",
    slug: "loans",
    title: "יחידה 3: הלוואות ולוחות סילוקין",
    description: "שפיצר, קרן שווה, יתרת הלוואה ופירוק תשלום לריבית וקרן במצב AMRT.",
    status: "draft",
    lessons: [
      outline("lsn_ln_spitzer", "spitzer", "לוח שפיצר", "החזר קבוע ופירוקו לקרן וריבית.", ["לחשב יתרת הלוואה", "לפרק תשלום לריבית וקרן"]),
      outline("lsn_ln_equal_principal", "equal-principal", "קרן שווה", "החזר קרן קבוע וריבית יורדת.", ["להשוות בין שפיצר לקרן שווה"]),
    ],
  },
  {
    id: "unit_stats_descriptive",
    slug: "descriptive-statistics",
    title: "יחידה 4: סטטיסטיקה והסתברות, חלק א׳: סטטיסטיקה תיאורית",
    description: "מדדי מרכז ופיזור, ממוצע משוקלל, תשואה ממוצעת וסיכון.",
    status: "draft",
    lessons: [
      outline("lsn_st_center", "central-tendency", "מדדי מרכז", "ממוצע, חציון ושכיח.", ["לחשב ממוצע וממוצע משוקלל"]),
      outline("lsn_st_dispersion", "dispersion", "מדדי פיזור", "שונות, סטיית תקן ומקדם השתנות.", ["להבחין בין סטיית תקן של אוכלוסייה למדגם", "לחשב סטיית תקן במצב STAT"]),
    ],
  },
  {
    id: "unit_probability",
    slug: "probability-and-combinatorics",
    title: "יחידה 5: סטטיסטיקה והסתברות, חלק ב׳: הסתברות וקומבינטוריקה",
    description:
      "עקרונות ספירה, עצרת, תמורות וצירופים, ספירה עם חזרות ובלי חזרות, ושימושם בחישובי הסתברות.",
    status: "draft",
    lessons: [
      outline("lsn_pr_counting", "counting-principle", "עקרון הספירה הבסיסי", "כפל אפשרויות בשלבים עוקבים.", ["לזהות מתי מכפילים ומתי מחברים מספרי אפשרויות"]),
      outline("lsn_pr_factorial", "factorial", "עצרת", "מספר הסידורים של n פריטים שונים.", ["לחשב n! במחשבון"]),
      outline("lsn_pr_permutations", "permutations", "תמורות: בחירה סדורה", "בחירה כשהסדר חשוב, בלי חזרות (nPr).", ["לחשב nPr במחשבון", "לזהות שאלה שבה הסדר חשוב"], {
        questions: [
          {
            id: "q_pr_perm_01",
            role: "practice",
            difficulty: 1,
            stem: "בוועדת השקעות 8 חברים. בכמה דרכים אפשר לבחור יו״ר, סגן ומזכיר, כשכל אדם ממלא תפקיד אחד לכל היותר?",
            options: [
              { key: "a", text: "56", value: 56 },
              { key: "b", text: "336", value: 336 },
              { key: "c", text: "512", value: 512 },
              { key: "d", text: "40,320", value: 40320 },
            ],
            correct: "b",
            explanation: "הסדר חשוב (התפקידים שונים) ואין חזרות, ולכן 8P3 = 8 × 7 × 6 = 336.",
            formulaSteps: [
              { title: "זיהוי סוג הבחירה", body: "בחירה סדורה, בלי חזרות: nPr." },
              { title: "חישוב", body: "8P3 = 8! ÷ 5! = 8 × 7 × 6 = 336" },
            ],
            check: { expression: "nPr(8, 3)", tolerance: 0 },
            calculator: {
              plan: { kind: "comp", expression: [{ num: 8 }, { fn: "nPr" }, { num: 3 }] },
              expectedDisplay: "336",
              compare: "same",
              resultMeaning: "מספר הדרכים לבחירה סדורה",
              interpretation: "יש 336 דרכים לאייש את שלושת התפקידים.",
              mistakes: ["להשתמש ב-nCr, שמתעלם מהסדר, ולקבל 56."],
            },
          },
        ],
      }),
      outline("lsn_pr_combinations", "combinations", "צירופים: בחירה לא סדורה", "בחירה כשהסדר אינו חשוב, בלי חזרות (nCr).", ["לחשב nCr במחשבון", "להבחין בין nPr ל-nCr"], {
        questions: [
          {
            id: "q_pr_comb_01",
            role: "practice",
            difficulty: 1,
            stem: "יועץ צריך לבחור 3 קופות גמל מתוך רשימה של 10 קופות לתיק של לקוח. בכמה דרכים אפשר לבחור, אם הסדר אינו חשוב?",
            options: [
              { key: "a", text: "30", value: 30 },
              { key: "b", text: "120", value: 120 },
              { key: "c", text: "720", value: 720 },
              { key: "d", text: "1,000", value: 1000 },
            ],
            correct: "b",
            explanation: "הסדר אינו חשוב ואין חזרות, ולכן 10C3 = 120.",
            formulaSteps: [
              { title: "זיהוי סוג הבחירה", body: "בחירה לא סדורה, בלי חזרות: nCr." },
              { title: "חישוב", body: "10C3 = 10! ÷ (3! × 7!) = 720 ÷ 6 = 120" },
            ],
            check: { expression: "nCr(10, 3)", tolerance: 0 },
            calculator: {
              plan: { kind: "comp", expression: [{ num: 10 }, { fn: "nCr" }, { num: 3 }] },
              expectedDisplay: "120",
              compare: "same",
              resultMeaning: "מספר הדרכים לבחירה לא סדורה",
              interpretation: "יש 120 דרכים לבחור את שלוש הקופות.",
              mistakes: ["להשתמש ב-nPr ולקבל 720, שסופר כל שילוב 6 פעמים."],
            },
          },
        ],
      }),
      outline("lsn_pr_repetition", "with-repetition", "ספירה עם חזרות ובלי חזרות", "nʳ לבחירה סדורה עם חזרות, וצירופים עם חזרות.", ["לבחור את נוסחת הספירה לפי סדר וחזרות"]),
      outline("lsn_pr_classical", "classical-probability", "הסתברות בעזרת קומבינטוריקה", "הסתברות כיחס בין מספר המקרים הרצויים למספר המקרים האפשריים.", ["לחשב הסתברות בעזרת nCr"]),
      outline("lsn_pr_binomial", "binomial", "התפלגות בינומית", "הסתברות ל-k הצלחות ב-n ניסויים.", ["לחשב הסתברות בינומית בעזרת nCr"]),
    ],
  },
  {
    id: "unit_exam_prep",
    slug: "exam-prep",
    title: "יחידה 6: חזרה למבחן וסימולציות",
    description: "סימולציות מבחן מלאות בזמן מוגבל, עם פתרון במחשבון לכל שאלה.",
    status: "draft",
    lessons: [outline("lsn_ex_review", "review", "חזרה מסכמת", "מעבר על כל סוגי השאלות.", ["לפתור שאלות מבחן בקצב מבחן"])],
  },
];
