/**
 * Independent financial math engine. Written from textbook formulas, not from
 * any calculator's conventions, so it can be used to cross-check calculator
 * sequences and AI-generated content. Rates are decimals (0.05 = 5%).
 */

function assertFinite(...values: number[]) {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RangeError("ערך לא מספרי בחישוב");
  }
}

/** Future value of a single amount: FV = PV (1+r)^n */
export function fvSingle(pv: number, rate: number, periods: number): number {
  assertFinite(pv, rate, periods);
  return pv * Math.pow(1 + rate, periods);
}

/** Present value of a single amount: PV = FV / (1+r)^n */
export function pvSingle(fv: number, rate: number, periods: number): number {
  assertFinite(fv, rate, periods);
  return fv / Math.pow(1 + rate, periods);
}

/** Simple interest amount: I = P r t */
export function simpleInterest(principal: number, rate: number, years: number): number {
  return principal * rate * years;
}

/** Effective annual rate from a nominal annual rate compounded m times a year. */
export function effectiveRate(nominal: number, compoundingsPerYear: number): number {
  assertFinite(nominal, compoundingsPerYear);
  return Math.pow(1 + nominal / compoundingsPerYear, compoundingsPerYear) - 1;
}

/** Nominal annual rate (compounded m times a year) equivalent to an effective rate. */
export function nominalRate(effective: number, compoundingsPerYear: number): number {
  return compoundingsPerYear * (Math.pow(1 + effective, 1 / compoundingsPerYear) - 1);
}

/** Rate per period equivalent to an effective annual rate, for p periods a year. */
export function equivalentPeriodicRate(effectiveAnnual: number, periodsPerYear: number): number {
  return Math.pow(1 + effectiveAnnual, 1 / periodsPerYear) - 1;
}

/** Present value of an ordinary annuity (end of period); due=true for annuity due. */
export function pvAnnuity(payment: number, rate: number, periods: number, due = false): number {
  assertFinite(payment, rate, periods);
  const base = rate === 0 ? periods : (1 - Math.pow(1 + rate, -periods)) / rate;
  return payment * base * (due ? 1 + rate : 1);
}

/** Future value of an ordinary annuity; due=true for annuity due. */
export function fvAnnuity(payment: number, rate: number, periods: number, due = false): number {
  assertFinite(payment, rate, periods);
  const base = rate === 0 ? periods : (Math.pow(1 + rate, periods) - 1) / rate;
  return payment * base * (due ? 1 + rate : 1);
}

/** Level payment that amortises a present value: PMT = PV r / (1 - (1+r)^-n) */
export function annuityPayment(presentValue: number, rate: number, periods: number, due = false): number {
  assertFinite(presentValue, rate, periods);
  const base = rate === 0 ? periods : (1 - Math.pow(1 + rate, -periods)) / rate;
  return presentValue / (base * (due ? 1 + rate : 1));
}

/** Number of periods for a single amount to grow from pv to fv. */
export function periodsToGrow(pv: number, fv: number, rate: number): number {
  return Math.log(fv / pv) / Math.log(1 + rate);
}

/** Rate per period for a single amount to grow from pv to fv in n periods. */
export function rateToGrow(pv: number, fv: number, periods: number): number {
  return Math.pow(fv / pv, 1 / periods) - 1;
}

/** NPV where cashFlows[0] occurs today (t=0). */
export function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/** IRR by bisection on [-0.99, 10]; throws when no sign change exists. */
export function irr(cashFlows: number[]): number {
  let low = -0.99;
  let high = 10;
  let fLow = npv(low, cashFlows);
  const fHigh = npv(high, cashFlows);
  if (Math.sign(fLow) === Math.sign(fHigh)) throw new RangeError("לא נמצא שיעור תשואה פנימי בטווח");
  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, cashFlows);
    if (Math.abs(fMid) < 1e-12) return mid;
    if (Math.sign(fMid) === Math.sign(fLow)) {
      low = mid;
      fLow = fMid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}
