import type { CalculatorFact, CalculatorKey, CalculatorModel } from "../types";

/**
 * CASIO FC-200V reference model.
 *
 * IMPORTANT: every statement about the device lives in FACTS. Statements marked
 * `sourced: false` were not confirmed from a primary source when this file was
 * written (the Casio manual host was not reachable). They stay "pending" in the
 * database until a reviewer confirms them against the official User's Guide
 * (FC-200V/FC-100V, RCA501407) or the physical calculator, from the admin
 * panel. Sequences that depend on a pending or rejected fact are never shown
 * to students; the verified formula solution is shown instead.
 */
const MANUAL = "CASIO FC-200V/FC-100V User's Guide";

export const FC200V_FACTS: CalculatorFact[] = [
  {
    key: "cmpd.entry",
    statement: "לחיצה על המקש CMPD נכנסת למצב ריבית דריבית, והשורה הראשונה במסך היא Set (תזמון תשלום End/Begin).",
    source: `${MANUAL}, CMPD section (worked example: "Enter CMPD mode and make sure the calculator displays [Set:End]")`,
    sourced: true,
  },
  {
    key: "cmpd.rows",
    statement: "סדר השורות במצב CMPD הוא Set, n, I%, PV, PMT, FV, P/Y, C/Y, והמעבר ביניהן נעשה במקשי החצים ▲ ▼.",
    source: `${MANUAL}, CMPD section (example: "Scroll down, enter … n … I% … PV … PMT … P/Y … C/Y. Scroll up to select [FV]")`,
    sourced: true,
  },
  {
    key: "cmpd.set_menu",
    statement: "לחיצה על EXE בשורת Set פותחת את האפשרויות 1:Begin ו-2:End, והבחירה נעשית בלחיצה על הספרה.",
    source: `${MANUAL}, payment timing options "1:Begin / 2:End" (key path to be confirmed on the device)`,
    sourced: false,
  },
  {
    key: "input.exe_stays",
    statement: "לאחר הקלדת ערך ולחיצה על EXE, הסמן נשאר באותה שורה (ולכן עוברים לשורה הבאה בלחיצה על ▼).",
    source: "unsourced",
    sourced: false,
  },
  {
    key: "input.neg",
    statement: "מספר שלילי מוזן בלחיצה על המקש (-) לפני הספרות.",
    source: `${MANUAL}, CMPD worked example ("(-)1000 for [PV]")`,
    sourced: true,
  },
  {
    key: "solve.key",
    statement: "כדי לחשב משתנה עוברים לשורה שלו ולוחצים על SOLVE.",
    source: `${MANUAL}, CMPD/CASH sections ("select … and solve it", "NPV:Solve")`,
    sourced: true,
  },
  {
    key: "cmpd.convention",
    statement:
      "חישובי CMPD פועלים לפי מוסכמת סימן תזרים (כסף שיוצא שלילי, כסף שנכנס חיובי), והריבית לתקופה נגזרת מ-I% לפי C/Y ו-P/Y.",
    source: `${MANUAL}, CMPD formula section and worked examples (PV entered as negative, FV/PMT solved positive)`,
    sourced: true,
  },
  {
    key: "cnvr.screen",
    statement:
      "במצב CNVR השורות הן n (מספר היוונים בשנה), I%, EFF ו-APR. ‏EFF:SOLVE ממיר את I% כריבית נומינלית לריבית אפקטיבית, ו-APR:SOLVE ממיר את I% כריבית אפקטיבית לנומינלית.",
    source: "unsourced",
    sourced: false,
  },
  {
    key: "display.format",
    statement: "התצוגה מציגה תוצאה של עד 10 ספרות משמעותיות, בלי אפסים נגררים.",
    source: "unsourced",
    sourced: false,
  },
  {
    key: "comp.entry",
    statement: "לחיצה על המקש COMP מחזירה למצב חישוב רגיל (COMP).",
    source: "unsourced",
    sourced: false,
  },
  {
    key: "comp.ncr",
    statement: "הפונקציה nCr זמינה בלחיצה על SHIFT ואחריה ÷, והקלטים חייבים להיות מספרים שלמים.",
    source: `${MANUAL}, "Permutation (nPr) and Combination (nCr)" (function exists; key position unsourced)`,
    sourced: false,
  },
  {
    key: "comp.npr",
    statement: "הפונקציה nPr זמינה בלחיצה על SHIFT ואחריה ×.",
    source: `${MANUAL}, "Permutation (nPr) and Combination (nCr)" (function exists; key position unsourced)`,
    sourced: false,
  },
  {
    key: "comp.factorial",
    statement: "העצרת x! זמינה בלחיצה על SHIFT ואחריה x⁻¹, אחרי הקלדת המספר.",
    source: `${MANUAL}, "Factorial (!)" (function exists; key position unsourced)`,
    sourced: false,
  },
  {
    key: "cash.screen",
    statement: "במצב CASH השורות הן I%, Csh (עורך נתונים), NPV, IRR, PBP, NFV.",
    source: `${MANUAL}, CASH section (items I%, Csh, NPV:Solve, IRR:Solve, PBP, NFV)`,
    sourced: true,
  },
  {
    key: "cash.editor",
    statement: "לחיצה על EXE בשורת Csh פותחת את עורך התזרימים; כל תזרים מוזן ואחריו EXE, ו-ESC חוזר למסך המשתנים.",
    source: `${MANUAL}, CASH section basic procedure`,
    sourced: true,
  },
  {
    key: "cash.editor_clear",
    statement: "יש לנקות את עורך התזרימים לפני הזנת סדרה חדשה, אחרת נשארים תזרימים ישנים (נתוני CASH ו-STAT חולקים זיכרון).",
    source: "unsourced (shared memory noted in third-party FC-200V 2nd Edition review)",
    sourced: false,
  },
];

const key = (id: string, label: string, extra: Partial<CalculatorKey> = {}): [string, CalculatorKey] => [id, { id, label, ...extra }];

export const FC200V_KEYS: Record<string, CalculatorKey> = Object.fromEntries([
  key("CMPD", "CMPD", { factKey: "cmpd.entry" }),
  key("CASH", "CASH", { factKey: "cash.screen" }),
  key("CNVR", "CNVR", { factKey: "cnvr.screen" }),
  key("COMP", "COMP", { factKey: "comp.entry" }),
  key("UP", "▲"),
  key("DOWN", "▼"),
  key("EXE", "EXE"),
  key("SOLVE", "SOLVE", { factKey: "solve.key" }),
  key("ESC", "ESC"),
  key("SHIFT", "SHIFT"),
  key("NEG", "(-)", { factKey: "input.neg" }),
  key("DOT", "."),
  key("ADD", "+"),
  key("SUB", "−"),
  key("MUL", "×"),
  key("DIV", "÷"),
  key("LPAREN", "("),
  key("RPAREN", ")"),
  key("INV", "x⁻¹"),
  key("NCR", "nCr", { press: ["SHIFT", "DIV"], factKey: "comp.ncr" }),
  key("NPR", "nPr", { press: ["SHIFT", "MUL"], factKey: "comp.npr" }),
  key("FACT", "x!", { press: ["SHIFT", "INV"], factKey: "comp.factorial" }),
  ...Array.from({ length: 10 }, (_, d) => key(String(d), String(d))),
]);

export const FC200V: CalculatorModel = {
  id: "casio-fc-200v",
  name: "CASIO FC-200V",
  displayDigits: 10,
  keys: FC200V_KEYS,
  facts: FC200V_FACTS,
};
