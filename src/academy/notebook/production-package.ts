import type { CalcSequence } from "../calculator/types";
import { getCalculator } from "../calculator";
import type { StoredCalculator } from "../services/types";

/**
 * Production package = everything needed to produce one video:
 *  - script (narration outline),
 *  - NotebookLM steering instructions,
 *  - source documents for NotebookLM,
 *  - reviewer checklist.
 *
 * Calculator key presses are NEVER produced by NotebookLM. For calculation
 * questions the script reserves a calculator segment that is rendered
 * deterministically from the verified key sequence
 * (/render/calculator/{questionId}); NotebookLM narrates the concept.
 */
export interface PackageInput {
  targetType: "lesson" | "question";
  title: string;
  lessonTitle: string;
  lessonSummary: string;
  formulas: Array<{ name: string; formula: string; meaning: string }>;
  question?: {
    id: string;
    stem: string;
    options: Array<{ key: string; text: string }>;
    correctKey: string;
    explanation: string;
    formulaSteps: Array<{ title: string; body: string }>;
    calculator: (StoredCalculator & { verified: boolean }) | null;
  };
  examples?: Array<{ title: string; problem: string; solution: string; calculator: (StoredCalculator & { verified: boolean }) | null }>;
  calculatorModel: string;
}

export interface ProductionPackage {
  title: string;
  scriptMd: string;
  instructionsMd: string;
  sources: Array<{ title: string; content: string }>;
  checklist: Array<{ key: string; label: string }>;
}

export const VIDEO_CHECKLIST = [
  { key: "academic", label: "הנוסחאות, המושגים וההסברים בסרטון נכונים מבחינה מקצועית" },
  { key: "numbers", label: "כל המספרים בסרטון תואמים את הפתרון המאומת" },
  { key: "calculator", label: "רצף המחשבון בסרטון הוא המקטע שהופק מהרצף המאומת, ואין בסרטון הוראות מחשבון אחרות" },
  { key: "language", label: "העברית תקינה, ברורה ומתאימה לנבחני רישוי" },
  { key: "quality", label: "איכות השמע והתמונה תקינה, והסרטון שלם" },
];

function keyLabels(sequence: CalcSequence, modelId: string, keys: string[]): string {
  const model = getCalculator(modelId).model;
  return keys
    .map((k) => {
      const def = model.keys[k];
      if (!def) return k === "CLR_DATA" ? "[ניקוי נתונים לפי המדריך]" : k;
      return def.press ? def.press.map((p) => `[${model.keys[p]?.label ?? p}]`).join(" ") : `[${def.label}]`;
    })
    .join(" ");
}

export function calculatorStepsMarkdown(calc: StoredCalculator, modelId: string): string {
  const seq = calc.sequence;
  const lines = [
    `מצב: ${seq.mode}. ${seq.modeExplanation}`,
    "",
    "| # | מקשים | תצוגה | הסבר |",
    "|---|---|---|---|",
    ...seq.steps.map((s, i) => `| ${i + 1} | ${keyLabels(seq, modelId, s.keys)} | ${s.expectDisplay ?? ""} | ${s.explanation} |`),
    "",
    `תוצאה: ${seq.result.display}. ${calc.interpretation}`,
  ];
  return lines.join("\n");
}

export function buildProductionPackage(input: PackageInput): ProductionPackage {
  const modelName = getCalculator(input.calculatorModel).model.name;
  const sources: Array<{ title: string; content: string }> = [];
  const formulasMd = input.formulas.map((f) => `- ${f.name}: ${f.formula} (${f.meaning})`).join("\n");

  sources.push({
    title: `${input.lessonTitle}: סיכום השיעור`,
    content: `# ${input.lessonTitle}\n\n${input.lessonSummary}\n\n## נוסחאות\n${formulasMd}`,
  });

  let script: string;
  if (input.targetType === "question" && input.question) {
    const q = input.question;
    const calc = q.calculator && q.calculator.verified ? q.calculator : null;
    const correct = q.options.find((o) => o.key === q.correctKey);
    sources.push({
      title: `שאלה ופתרון מאומת: ${input.title}`,
      content: [
        `# השאלה\n${q.stem}`,
        `## אפשרויות\n${q.options.map((o) => `- (${o.key}) ${o.text}`).join("\n")}`,
        `## התשובה הנכונה\n(${q.correctKey}) ${correct?.text ?? ""}\n\n${q.explanation}`,
        `## פתרון בנוסחה\n${q.formulaSteps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n")}`,
        calc
          ? `## פתרון במחשבון ${modelName}\nהמקשים יוצגו בסרטון כמקטע מונפש נפרד. בהסבר הקולי יש לתאר את מטרת כל שלב ולא את המקשים.\n\n${calculatorStepsMarkdown(calc, input.calculatorModel)}`
          : "## פתרון במחשבון\nאין לשאלה זו רצף מחשבון מאומת. אין להזכיר מקשים או מצבי מחשבון בסרטון.",
      ].join("\n\n"),
    });
    script = calc
      ? [
          `# תסריט: ${input.title}`,
          "מבנה מועדף לשאלת חישוב: המחשבון קודם.",
          `## 1. הצגת השאלה\n${q.stem}`,
          `## 2. זיהוי הנתונים\n${calc.sequence.inputs.map((i) => `- ${i.variable} = ${i.value}: ${i.meaning}`).join("\n")}`,
          `## 3. איזו פונקציה במחשבון\n${calc.sequence.modeExplanation}`,
          `## 4. רצף המחשבון (מקטע מונפש שמופק אוטומטית, לא על ידי NotebookLM)\nמקור המקטע: /render/calculator/${q.id}\n\n${calculatorStepsMarkdown(calc, input.calculatorModel)}`,
          `## 5. התוצאה הסופית\nבמסך: ${calc.sequence.result.display}. התשובה: (${q.correctKey}) ${correct?.text ?? ""}`,
          `## 6. משמעות וטעות נפוצה\n${calc.interpretation}\nטעות נפוצה: ${calc.sequence.commonMistakes[0] ?? ""}`,
        ].join("\n\n")
      : [
          `# תסריט: ${input.title}`,
          "לשאלה אין רצף מחשבון מאומת, ולכן הסרטון מציג את הפתרון המתמטי המאומת.",
          `## 1. הצגת השאלה\n${q.stem}`,
          `## 2. הפתרון\n${q.formulaSteps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n")}`,
          `## 3. התשובה ומשמעותה\n(${q.correctKey}) ${correct?.text ?? ""}. ${q.explanation}`,
        ].join("\n\n");
  } else {
    const examples = input.examples ?? [];
    examples.forEach((example) => {
      sources.push({
        title: `דוגמה פתורה: ${example.title}`,
        content: [
          `# ${example.title}`,
          example.problem,
          `## פתרון בנוסחה\n${example.solution}`,
          example.calculator?.verified ? `## פתרון במחשבון (יוצג כמקטע מונפש נפרד)\n${calculatorStepsMarkdown(example.calculator, input.calculatorModel)}` : "",
        ].join("\n\n"),
      });
    });
    script = [
      `# תסריט שיעור: ${input.lessonTitle}`,
      "## 1. פתיחה: למה זה חשוב ליועץ פנסיוני",
      "## 2. הרעיון המרכזי (NotebookLM, הסבר מושגי)",
      input.lessonSummary,
      "## 3. הנוסחאות כדי להבין את ההיגיון",
      formulasMd,
      "## 4. דוגמה פתורה במחשבון (מקטע מונפש שמופק אוטומטית)",
      ...examples.map((e) => `- ${e.title}: ${e.calculator?.verified ? "מקטע מחשבון מאומת" : "אין מקטע מחשבון מאומת, ולכן מציגים את הפתרון בנוסחה"}`),
      "## 5. סיכום וטעויות נפוצות",
    ].join("\n\n");
  }

  const instructions = [
    "NotebookLM Video Overview instructions (paste into the customisation box):",
    "",
    "- Narrate entirely in Hebrew, for adults preparing for the Israeli pension-advisor licensing exam.",
    "- Use ONLY the uploaded sources. Every number must appear exactly as in the sources.",
    `- Do NOT describe calculator key presses, menus or modes, and do not mention other calculator models. The ${modelName} key sequence is inserted afterwards as a separate rendered segment; refer to it as "בשלב הבא נראה את רצף המקשים במחשבון".`,
    "- For calculation questions follow this order: present the question, identify the data, say which calculator function is used, (rendered calculator segment), state the final result, explain its meaning and one common mistake.",
    "- Keep it under 6 minutes. Calm, clear, exam-oriented tone.",
  ].join("\n");

  return { title: input.title, scriptMd: script, instructionsMd: instructions, sources, checklist: VIDEO_CHECKLIST };
}

/** Numbers in a generated script must come from the verified sources. */
export function findUnverifiedNumbers(script: string, allowedText: string): string[] {
  const normalize = (s: string) => s.replace(/,/g, "");
  const allowed = new Set((normalize(allowedText).match(/-?\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const found = normalize(script).match(/-?\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.filter((n) => Number(n) > 10 && !allowed.has(String(Number(n)))))];
}
