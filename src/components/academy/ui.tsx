import type { ReactNode } from "react";

type Tone = "slate" | "green" | "amber" | "red" | "blue" | "violet" | "dark";

/** Status tag: small, 4px corners, tinted background (design 04 · tags). */
export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    slate: "bg-line-soft text-subtle",
    green: "bg-success-soft text-success-ink",
    amber: "bg-warn-soft text-warn-ink",
    red: "bg-danger-soft text-danger-ink",
    blue: "bg-accent-soft text-accent-hover",
    violet: "bg-accent-soft text-accent",
    dark: "bg-dark text-white",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold leading-none ${tones[tone]}`}>{children}</span>;
}

/** Surface: white, 1px border, 6px corners. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-xl border border-line bg-white p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-tight">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const base = "inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const btn = {
  /** Main action (indigo). */
  primary: `${base} bg-accent text-white hover:bg-accent-hover`,
  /** Strong neutral action (near-black), e.g. "continue", "next". */
  dark: `${base} bg-dark text-white hover:bg-black`,
  /** Outlined. */
  secondary: `${base} border border-input bg-white text-ink hover:bg-surface`,
  /** Soft indigo (AI / alternative action). */
  soft: `${base} bg-accent-soft text-accent-hover hover:bg-brand-100`,
  /** Text link button. */
  ghost: "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-50",
  danger: `${base} bg-danger text-white hover:bg-danger-ink`,
};

export const input =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Progress bar (4px, dark fill). */
export function Progress({ value, tone = "dark" }: { value: number; tone?: "dark" | "accent" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-1 rounded-full ${tone === "accent" ? "bg-accent" : "bg-dark"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small numeric statistic. */
export function Stat({ label, value, note, noteTone = "muted" }: { label: string; value: ReactNode; note?: ReactNode; noteTone?: "muted" | "green" | "amber" }) {
  const tones = { muted: "text-muted", green: "text-success-ink", amber: "text-warn-ink" };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="ltr text-start text-3xl font-bold text-ink">{value}</span>
      {note && <span className={`text-xs ${tones[noteTone]}`}>{note}</span>}
    </div>
  );
}

export function lockReasonText(reason: string | null): string {
  switch (reason) {
    case "login_required":
      return "יש להתחבר";
    case "subscription_required":
      return "למנויים";
    case "not_published":
      return "בקרוב";
    default:
      return "";
  }
}

/** Hebrew option letters, as in the design (א ב ג ד). */
export function optionLetter(key: string): string {
  return { a: "א", b: "ב", c: "ג", d: "ד", e: "ה" }[key] ?? key.toUpperCase();
}
