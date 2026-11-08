import { describe, expect, it } from "vitest";
import * as f from "../math/finance";
import * as s from "../math/statistics";
import { evaluate } from "../math/expression";

describe("finance engine", () => {
  it("computes compound growth and discounting", () => {
    expect(f.fvSingle(10000, 0.05, 10)).toBeCloseTo(16288.946, 3);
    expect(f.pvSingle(50000, 0.04, 8)).toBeCloseTo(36534.51, 2);
    expect(f.periodsToGrow(20000, 30000, 0.06)).toBeCloseTo(6.9585, 4);
  });
  it("converts nominal and effective rates both ways", () => {
    expect(f.effectiveRate(0.12, 12)).toBeCloseTo(0.126825, 6);
    expect(f.nominalRate(f.effectiveRate(0.09, 4), 4)).toBeCloseTo(0.09, 12);
  });
  it("handles annuities, annuity due and zero rate", () => {
    expect(f.annuityPayment(100000, 0.005, 60)).toBeCloseTo(1933.28, 2);
    expect(f.pvAnnuity(3000, 0.05 / 12, 24, true)).toBeCloseTo(f.pvAnnuity(3000, 0.05 / 12, 24) * (1 + 0.05 / 12), 8);
    expect(f.fvAnnuity(100, 0, 12)).toBe(1200);
  });
  it("computes NPV and IRR consistently", () => {
    const flows = [-1000, 300, 400, 500];
    const rate = f.irr(flows);
    expect(f.npv(rate, flows)).toBeCloseTo(0, 6);
    expect(() => f.irr([100, 100])).toThrow();
  });
});

describe("counting and statistics", () => {
  it("counts selections", () => {
    expect(s.factorial(5)).toBe(120);
    expect(s.permutations(8, 3)).toBe(336);
    expect(s.combinations(10, 3)).toBe(120);
    expect(s.combinations(52, 5)).toBe(2598960);
    expect(s.permutationsWithRepetition(10, 4)).toBe(10000);
    expect(s.combinationsWithRepetition(3, 2)).toBe(6);
    expect(() => s.combinations(3, 5)).toThrow();
  });
  it("distinguishes population and sample dispersion", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(s.mean(xs)).toBe(5);
    expect(s.stdPopulation(xs)).toBe(2);
    expect(s.stdSample(xs)).toBeCloseTo(2.13809, 5);
    expect(s.binomialPmf(4, 2, 0.5)).toBeCloseTo(0.375, 10);
  });
});

describe("safe expression evaluator", () => {
  it("evaluates whitelisted functions, arrays and precedence", () => {
    expect(evaluate("fv_single(10000, 0.05, 10)")).toBeCloseTo(16288.946, 3);
    expect(evaluate("npv(0.1, [-1000, 300, 400, 500])")).toBeCloseTo(-21.0368, 4);
    expect(evaluate("-2^2 + 3*4")).toBe(8);
    expect(evaluate("nCr(10,3) / nPr(10,3)")).toBeCloseTo(1 / 6, 12);
  });
  it("rejects anything outside the whitelist", () => {
    expect(() => evaluate("process.exit(1)")).toThrow();
    expect(() => evaluate("constructor(1)")).toThrow();
    expect(() => evaluate("1/0")).toThrow();
  });
});
