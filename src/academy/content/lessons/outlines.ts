import type { SeedLesson } from "../types";

/**
 * Lessons 4–16: outlines (status "draft") mapped to chapters 4–14 and the rest
 * of chapter 2. They are produced through the AI Content Factory and published
 * only after review. Ids of earlier draft lessons are reused, so nothing
 * already stored is orphaned. The lesson list must still be checked against
 * the official syllabus.
 */
function outline(
  id: string, slug: string, number: number, chapters: number[], title: string, description: string,
  topics: string[], objectives: string[], extra: Partial<SeedLesson> = {},
): SeedLesson {
  return {
    id, slug, number, chapters, topics, title, description,
    access: "paid", status: "draft", minutes: 45, objectives,
    summary: "", formulas: [], examples: [], questions: [], ...extra,
  };
}

export const financeOutlines: SeedLesson[] = [
  outline("lsn_ln_spitzer", "loans-amortization", 4, [2], "שיעור 4 — הלוואות ולוחות סילוקין",
    "שפיצר, קרן שווה, בלון וגרייס, ופירוק תשלום לריבית וקרן.",
    ["הלוואת בלון", "לוח שפיצר", "לוח קרן שווה", "תקופת גרייס", "יתרת הלוואה", "AMRT"],
    ["לחשב החזר שפיצר ב-CMPD", "לפרק תשלום לריבית וקרן", "לחשב יתרת הלוואה", "להשוות בין שפיצר לקרן שווה"]),
  outline("lsn_l05_indexation", "indexation-inflation", 5, [3], "שיעור 5 — הצמדה, אינפלציה וריבית ריאלית",
    "מדד המחירים, ריבית נומינלית וריאלית, ותזרימים צמודים.",
    ["מדד המחירים לצרכן", "ריבית נומינלית וריאלית", "תזרימים צמודים", "עמלות"],
    ["להמיר בין ריבית נומינלית לריאלית", "להצמיד סכום למדד"]),
  outline("lsn_cf_npv", "variable-perpetual-flows", 6, [4], "שיעור 6 — תזרים משתנה ותזרים אינסופי",
    "תזרימים לא אחידים ב-CASH, תזרים צומח וסדרות אינסופיות.",
    ["תזרים לא אחיד", "CASH", "תזרים צומח", "סדרה אינסופית קבועה", "סדרה אינסופית צומחת"],
    ["לחשב ערך נוכחי של תזרים לא אחיד ב-CASH", "לחשב ערך נוכחי של סדרה אינסופית"]),
  outline("lsn_l07_bonds", "bonds", 7, [5], "שיעור 7 — אגרות חוב",
    "מחיר אג\"ח, תשואה לפדיון, ואג\"ח בפרמיה, בניכיון ובפארי.",
    ["ערך נקוב וקופון", "מחיר אג\"ח", "תשואה לפדיון", "אג\"ח ללא קופון", "פרמיה וניכיון"],
    ["לחשב מחיר אג\"ח ב-CMPD", "לחשב תשואה לפדיון"]),
  outline("lsn_cf_irr", "project-evaluation", 8, [6], "שיעור 8 — בדיקת כדאיות השקעה בפרויקטים",
    "NPV, IRR, מדד רווחיות והשוואת פרויקטים.",
    ["NPV", "IRR", "מדד רווחיות", "פרויקטים מוציאים זה את זה", "שווה ערך שנתי"],
    ["לחשב NPV ו-IRR ב-CASH", "לבחור בין פרויקטים"]),
];

export const statisticsOutlines: SeedLesson[] = [
  outline("lsn_pr_permutations", "combinatorics", 9, [7], "שיעור 9 — קומבינטוריקה",
    "עקרון הכפל, עצרת, תמורות וצירופים, עם חזרות ובלי חזרות.",
    ["עקרון הכפל", "עצרת", "תמורות", "צירופים", "חזרות", "מגבלות"],
    ["להבחין בין תמורות לצירופים", "לחשב nPr ו-nCr"], {
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
  outline("lsn_pr_classical", "probability", 10, [8], "שיעור 10 — הסתברות",
    "מאורעות, כללי חיבור וכפל, הסתברות מותנית ודיאגרמת עץ.",
    ["מרחב מדגם", "כללי חיבור וכפל", "הסתברות מותנית", "דיאגרמת עץ", "בייס"],
    ["לחשב הסתברות מותנית", "לבנות דיאגרמת עץ"]),
  outline("lsn_st_center", "descriptive-statistics", 11, [9], "שיעור 11 — משתנה אחד ומדדים",
    "ממוצע, חציון, שכיח, שונות, סטיית תקן ותוחלת.",
    ["ממוצע וממוצע משוקלל", "חציון ושכיח", "שונות וסטיית תקן", "תוחלת"],
    ["לחשב מדדי מרכז ופיזור ב-STAT", "להבחין בין אוכלוסייה למדגם"]),
  outline("lsn_pr_binomial", "distributions", 12, [10], "שיעור 12 — התפלגויות והתפלגות נורמלית",
    "התפלגות בינומית, התפלגות נורמלית וציוני Z.",
    ["משתנה מקרי", "התפלגות בינומית", "התפלגות נורמלית", "ציוני Z"],
    ["לחשב הסתברות בינומית", "לחשב הסתברות בהתפלגות נורמלית"]),
  outline("lsn_l13_two_variables", "two-variables", 13, [11], "שיעור 13 — שני משתנים: מתאם ורגרסיה",
    "שונות משותפת, מקדם מתאם ורגרסיה ליניארית.",
    ["שונות משותפת", "מקדם מתאם", "רגרסיה ליניארית"],
    ["לחשב מקדם מתאם", "לפרש קו רגרסיה"]),
];

export const investmentOutlines: SeedLesson[] = [
  outline("lsn_l14_risky_assets", "risky-assets", 14, [12], "שיעור 14 — הערכת מניות ונכסים מסוכנים",
    "תוחלת תשואה, סיכון והערכת מניות.",
    ["תוחלת תשואה", "סטיית תקן של תשואה", "סיכון ותשואה", "הערכת מניות"],
    ["לחשב תוחלת וסטיית תקן של תשואה"]),
  outline("lsn_l15_markowitz", "portfolio-markowitz", 15, [13], "שיעור 15 — תיק השקעות ומודל מרקוביץ'",
    "תשואת תיק, שונות תיק, מתאם ופיזור סיכונים.",
    ["תוחלת תשואת תיק", "שונות תיק", "מתאם", "פיזור", "תיק יעיל"],
    ["לחשב תוחלת ושונות של תיק בשני נכסים"]),
  outline("lsn_l16_capm", "capm", 16, [14], "שיעור 16 — מודל CAPM",
    "ביתא, פרמיית סיכון, SML ו-CML.",
    ["ריבית חסרת סיכון", "ביתא", "פרמיית סיכון", "SML", "CML"],
    ["לחשב תשואה נדרשת לפי CAPM", "להבחין בין CML ל-SML"]),
];
