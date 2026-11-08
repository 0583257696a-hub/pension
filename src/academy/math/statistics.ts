/** Descriptive statistics, counting and probability helpers. */

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("עצרת מוגדרת רק למספר שלם אי-שלילי");
  if (n > 170) throw new RangeError("ערך גדול מדי לעצרת");
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** Ordered selection without repetition: nPr = n!/(n-r)! */
export function permutations(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) throw new RangeError("nPr דורש 0 ≤ r ≤ n שלמים");
  let result = 1;
  for (let i = 0; i < r; i++) result *= n - i;
  return result;
}

/** Unordered selection without repetition: nCr = n!/(r!(n-r)!) */
export function combinations(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) throw new RangeError("nCr דורש 0 ≤ r ≤ n שלמים");
  const k = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** Ordered selection with repetition: n^r */
export function permutationsWithRepetition(n: number, r: number): number {
  return Math.pow(n, r);
}

/** Unordered selection with repetition: C(n+r-1, r) */
export function combinationsWithRepetition(n: number, r: number): number {
  return combinations(n + r - 1, r);
}

export function mean(values: number[]): number {
  if (values.length === 0) throw new RangeError("אין נתונים");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population variance (divide by n). */
export function variancePopulation(values: number[]): number {
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

/** Sample variance (divide by n-1). */
export function varianceSample(values: number[]): number {
  if (values.length < 2) throw new RangeError("נדרשות לפחות שתי תצפיות");
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

export function stdPopulation(values: number[]): number {
  return Math.sqrt(variancePopulation(values));
}

export function stdSample(values: number[]): number {
  return Math.sqrt(varianceSample(values));
}

/** Binomial probability P(X = k) for n trials with success probability p. */
export function binomialPmf(n: number, k: number, p: number): number {
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}
