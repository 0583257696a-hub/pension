/**
 * FC-200V face (design 04). Schematic: it shows key labels in a fixed grid;
 * physical positions on the device may differ. Keys in `hot` are highlighted.
 */
type Kind = "sys" | "shift" | "fn" | "num" | "op" | "exe";

const ROW_TOP: Array<[string, string, Kind]> = [
  ["SHIFT", "SHIFT", "shift"], ["ALPHA", "ALPHA", "sys"], ["UP", "▲", "sys"], ["DOWN", "▼", "sys"], ["ESC", "ESC", "sys"], ["ON", "ON", "sys"],
];
const ROW_FN: Array<[string, string, Kind]> = ["SIMP", "CMPD", "CASH", "AMRT", "CNVR", "COST", "DAYS", "DEPR", "BOND", "SOLVE"].map((k) => [k, k, "fn"]);
const ROW_EXTRA: Array<[string, string, Kind]> = [["COMP", "COMP", "fn"], ["LPAREN", "(", "fn"], ["RPAREN", ")", "fn"], ["INV", "x⁻¹", "fn"]];
const ROW_NUM: Array<[string, string, Kind]> = [
  ["7", "7", "num"], ["8", "8", "num"], ["9", "9", "num"], ["DEL", "DEL", "op"], ["AC", "AC", "op"],
  ["4", "4", "num"], ["5", "5", "num"], ["6", "6", "num"], ["MUL", "×", "op"], ["DIV", "÷", "op"],
  ["1", "1", "num"], ["2", "2", "num"], ["3", "3", "num"], ["ADD", "+", "op"], ["SUB", "−", "op"],
  ["0", "0", "num"], ["DOT", ".", "num"], ["NEG", "(−)", "op"], ["ANS", "Ans", "op"], ["EXE", "EXE", "exe"],
];

const KIND: Record<Kind, string> = {
  sys: "h-[26px] bg-[#3A3F47] text-[#F2F4F7] text-[10px]",
  shift: "h-[26px] bg-[#B7791F] text-white text-[10px]",
  fn: "h-[26px] bg-[#4B5260] text-white text-[10px]",
  num: "h-[34px] bg-[#E9EAEC] text-dark text-[15px]",
  op: "h-[34px] bg-[#C9CBD0] text-dark text-[13px]",
  exe: "h-[34px] bg-[#2F6DB5] text-white text-[12px]",
};

export const EXTRA_KEYS = new Set(ROW_EXTRA.map(([id]) => id));

function Key({ id, label, kind, hot }: { id: string; label: string; kind: Kind; hot: Set<string> }) {
  const on = hot.has(id);
  const size = KIND[kind].split(" ").filter((c) => c.startsWith("h-") || c.startsWith("text-[")).join(" ");
  return (
    <span
      data-key={id}
      className={`flex items-center justify-center rounded-[5px] font-bold tracking-[0.02em] transition-colors duration-150 [font-family:Arial,sans-serif] ${
        on ? `${size} translate-y-px bg-accent text-white shadow-[0_0_0_3px_rgba(165,180,252,0.55)]` : `${KIND[kind]} shadow-[0_2px_0_rgba(0,0,0,0.35)]`
      }`}
    >
      {label}
    </span>
  );
}

export default function CalculatorFace({ hot, top, main, modelName = "FC-200V", showExtra = false }: {
  hot: string[]; top: string; main: string; modelName?: string; showExtra?: boolean;
}) {
  const set = new Set(hot);
  return (
    <div
      dir="ltr"
      role="img"
      aria-label={`מחשבון פיננסי ${modelName}. בתצוגה: ${main}`}
      className="flex w-[300px] max-w-full flex-col gap-3.5 rounded-[18px_18px_26px_26px] bg-gradient-to-b from-[#2B2F36] to-[#1C1F24] px-4 pb-[22px] pt-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_48px_-16px_rgba(16,24,40,0.35)]"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#D0D5DD]">CASIO</span>
        <span className="text-[10px] tracking-[0.06em] text-faint">{modelName.replace(/^CASIO\s*/, "")}</span>
      </div>
      <div className="calc-display flex min-h-16 flex-col gap-1 rounded bg-calc-screen px-3 py-2.5 text-[#1A2014] shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)]">
        <span className="min-h-4 text-[11px] opacity-75">{top}</span>
        <span className="truncate text-right text-xl font-bold">{main}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">{ROW_TOP.map(([id, l, k]) => <Key key={id} id={id} label={l} kind={k} hot={set} />)}</div>
      <div className="grid grid-cols-5 gap-1.5">{ROW_FN.map(([id, l, k]) => <Key key={id} id={id} label={l} kind={k} hot={set} />)}</div>
      {showExtra && <div className="grid grid-cols-4 gap-1.5">{ROW_EXTRA.map(([id, l, k]) => <Key key={id} id={id} label={l} kind={k} hot={set} />)}</div>}
      <div className="my-0.5 h-px bg-[#3A3F47]" />
      <div className="grid grid-cols-5 gap-[7px]">{ROW_NUM.map(([id, l, k]) => <Key key={id} id={id} label={l} kind={k} hot={set} />)}</div>
    </div>
  );
}
