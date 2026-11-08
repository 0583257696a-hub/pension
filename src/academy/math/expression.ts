import * as finance from "./finance";
import * as stats from "./statistics";

/**
 * Safe arithmetic expression evaluator used to verify content.
 * Supports numbers, + - * / ^, parentheses, unary minus, array literals
 * [a, b, c] (for cash flows / data sets) and a whitelist of engine functions.
 * No identifiers other than whitelisted functions are accepted, so arbitrary
 * code can never run.
 */
type Value = number | number[];

const FUNCTIONS: Record<string, (...args: Value[]) => number> = {
  fv_single: (pv, r, n) => finance.fvSingle(num(pv), num(r), num(n)),
  pv_single: (fv, r, n) => finance.pvSingle(num(fv), num(r), num(n)),
  simple_interest: (p, r, t) => finance.simpleInterest(num(p), num(r), num(t)),
  effective_rate: (j, m) => finance.effectiveRate(num(j), num(m)),
  nominal_rate: (e, m) => finance.nominalRate(num(e), num(m)),
  periodic_rate: (e, p) => finance.equivalentPeriodicRate(num(e), num(p)),
  pv_annuity: (pmt, r, n, due = 0) => finance.pvAnnuity(num(pmt), num(r), num(n), num(due) === 1),
  fv_annuity: (pmt, r, n, due = 0) => finance.fvAnnuity(num(pmt), num(r), num(n), num(due) === 1),
  annuity_payment: (pv, r, n, due = 0) => finance.annuityPayment(num(pv), num(r), num(n), num(due) === 1),
  periods_to_grow: (pv, fv, r) => finance.periodsToGrow(num(pv), num(fv), num(r)),
  rate_to_grow: (pv, fv, n) => finance.rateToGrow(num(pv), num(fv), num(n)),
  npv: (r, flows) => finance.npv(num(r), arr(flows)),
  irr: (flows) => finance.irr(arr(flows)),
  factorial: (n) => stats.factorial(num(n)),
  nPr: (n, r) => stats.permutations(num(n), num(r)),
  nCr: (n, r) => stats.combinations(num(n), num(r)),
  n_pow_r: (n, r) => stats.permutationsWithRepetition(num(n), num(r)),
  nCr_rep: (n, r) => stats.combinationsWithRepetition(num(n), num(r)),
  mean: (xs) => stats.mean(arr(xs)),
  var_pop: (xs) => stats.variancePopulation(arr(xs)),
  var_sample: (xs) => stats.varianceSample(arr(xs)),
  sd_pop: (xs) => stats.stdPopulation(arr(xs)),
  sd_sample: (xs) => stats.stdSample(arr(xs)),
  binom_pmf: (n, k, p) => stats.binomialPmf(num(n), num(k), num(p)),
  sqrt: (x) => Math.sqrt(num(x)),
  ln: (x) => Math.log(num(x)),
  abs: (x) => Math.abs(num(x)),
  round: (x, d = 0) => {
    const f = Math.pow(10, num(d));
    return Math.round(num(x) * f) / f;
  },
};

export const SUPPORTED_FUNCTIONS = Object.keys(FUNCTIONS);

function num(v: Value | undefined): number {
  if (typeof v !== "number") throw new TypeError("צפוי מספר");
  return v;
}
function arr(v: Value | undefined): number[] {
  if (!Array.isArray(v)) throw new TypeError("צפויה רשימת ערכים");
  return v;
}

type Token = { type: "num"; value: number } | { type: "id"; value: string } | { type: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(input.slice(i));
      if (!match) throw new SyntaxError(`מספר לא תקין במיקום ${i}`);
      tokens.push({ type: "num", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i))!;
      tokens.push({ type: "id", value: match[0] });
      i += match[0].length;
      continue;
    }
    if ("+-*/^(),[]".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new SyntaxError(`תו לא נתמך: ${ch}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Value {
    const value = this.expr();
    if (this.pos !== this.tokens.length) throw new SyntaxError("ביטוי לא תקין");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(op: string): boolean {
    const t = this.peek();
    if (t && t.type === "op" && t.value === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(op: string) {
    if (!this.eat(op)) throw new SyntaxError(`צפוי "${op}"`);
  }

  private expr(): Value {
    let left = this.term();
    for (;;) {
      if (this.eat("+")) left = num(left) + num(this.term());
      else if (this.eat("-")) left = num(left) - num(this.term());
      else return left;
    }
  }

  private term(): Value {
    let left = this.unary();
    for (;;) {
      if (this.eat("*")) left = num(left) * num(this.unary());
      else if (this.eat("/")) left = num(left) / num(this.unary());
      else return left;
    }
  }

  private unary(): Value {
    if (this.eat("-")) return -num(this.unary());
    if (this.eat("+")) return num(this.unary());
    return this.power();
  }

  private power(): Value {
    const base = this.primary();
    if (this.eat("^")) return Math.pow(num(base), num(this.unary()));
    return base;
  }

  private primary(): Value {
    const t = this.peek();
    if (!t) throw new SyntaxError("ביטוי חסר");
    if (t.type === "num") {
      this.pos++;
      return t.value;
    }
    if (t.type === "id") {
      this.pos++;
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new SyntaxError(`פונקציה לא מוכרת: ${t.value}`);
      this.expect("(");
      const args: Value[] = [];
      if (!this.eat(")")) {
        do args.push(this.expr());
        while (this.eat(","));
        this.expect(")");
      }
      return fn(...args);
    }
    if (this.eat("(")) {
      const v = this.expr();
      this.expect(")");
      return v;
    }
    if (this.eat("[")) {
      const items: number[] = [];
      if (!this.eat("]")) {
        do items.push(num(this.expr()));
        while (this.eat(","));
        this.expect("]");
      }
      return items;
    }
    throw new SyntaxError("ביטוי לא תקין");
  }
}

export function evaluate(expression: string): number {
  const value = new Parser(tokenize(expression)).parse();
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError("תוצאת הביטוי אינה מספר סופי");
  return value;
}

export function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}
