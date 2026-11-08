import { describe, expect, it } from "vitest";
import { buildSequence } from "../calculator/fc200v/builders";
import { formatDisplay, simulate } from "../calculator/fc200v/simulator";
import { FC200V } from "../calculator/fc200v/model";
import { verdictFor, type CalcSequence } from "../calculator";
import { financeStatisticsCourse } from "../content/course";

const opts = (display: string) => ({ expectedDisplay: display, resultMeaning: "test" });

describe("FC-200V display formatting", () => {
  it("shows up to 10 significant digits without trailing zeros", () => {
    expect(formatDisplay(16288.946267774423)).toBe("16288.94627");
    expect(formatDisplay(29775.40000000001)).toBe("29775.4");
    expect(formatDisplay(-1933.2801529428275)).toBe("-1933.280153");
    expect(formatDisplay(120)).toBe("120");
  });
});

describe("FC-200V simulator", () => {
  it("reproduces the CMPD worked example inputs from the User's Guide (n=2, I%=12, PV=-1000, P/Y=1, C/Y=2)", () => {
    const seq = buildSequence({ kind: "cmpd", set: "End", n: 2, i: 12, pv: -1000, pmt: 0, py: 1, cy: 2, solveFor: "FV" }, opts("FV=1262.47696"));
    const report = simulate(seq);
    expect(report.errors).toEqual([]);
    expect(report.finalValue).toBeCloseTo(1000 * Math.pow(1.06, 4), 6);
  });

  it("fails a sequence whose expected display is wrong", () => {
    const seq = buildSequence({ kind: "cmpd", set: "End", n: 10, i: 5, pv: -10000, pmt: 0, py: 1, cy: 1, solveFor: "FV" }, opts("FV=16288.95"));
    const report = simulate(seq);
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("16288.94627");
  });

  it("fails a sequence that relies on values left in memory", () => {
    const seq = buildSequence({ kind: "cmpd", set: "End", n: 10, i: 5, pv: -10000, pmt: 0, py: 1, cy: 1, solveFor: "FV" }, opts("FV=16288.94627"));
    const broken: CalcSequence = { ...seq, steps: seq.steps.filter((s) => !s.keys.includes("NEG")) };
    const report = simulate(broken);
    expect(report.ok).toBe(false);
  });

  it("fails a key that does not exist on the model", () => {
    const seq = buildSequence({ kind: "cnvr", n: 12, i: 12, solveFor: "EFF" }, opts("EFF=12.68250301"));
    const broken: CalcSequence = { ...seq, steps: [{ keys: ["STO"], explanation: "x" }, ...seq.steps] };
    expect(simulate(broken).errors[0]).toContain("STO");
  });

  it("solves n and I% by search and handles Begin mode", () => {
    const n = simulate(buildSequence({ kind: "cmpd", set: "End", i: 6, pv: -20000, pmt: 0, fv: 30000, py: 1, cy: 1, solveFor: "n" }, opts("n=6.958515633")));
    expect(n.errors).toEqual([]);
    const begin = simulate(buildSequence({ kind: "cmpd", set: "Begin", n: 24, i: 5, pmt: -3000, fv: 0, py: 12, cy: 12, solveFor: "PV" }, opts("PV=68666.61891")));
    expect(begin.errors).toEqual([]);
  });

  it("evaluates COMP counting functions", () => {
    expect(simulate(buildSequence({ kind: "comp", expression: [{ num: 10 }, { fn: "nCr" }, { num: 3 }] }, opts("120"))).ok).toBe(true);
    expect(simulate(buildSequence({ kind: "comp", expression: [{ num: 8 }, { fn: "nPr" }, { num: 3 }] }, opts("336"))).ok).toBe(true);
    expect(simulate(buildSequence({ kind: "comp", expression: [{ num: 5 }, { postfix: "factorial" }] }, opts("120"))).ok).toBe(true);
  });

  it("requires clearing the cash-flow editor before entering flows", () => {
    const seq = buildSequence({ kind: "cash", i: 10, flows: [-1000, 300, 400, 500], solveFor: "NPV" }, opts("NPV=-21.03681443"));
    expect(simulate(seq).errors).toEqual([]);
    const noClear: CalcSequence = { ...seq, steps: seq.steps.filter((s) => !s.keys.includes("CLR_DATA")) };
    expect(simulate(noClear).ok).toBe(false);
  });
});

describe("calculator verdict", () => {
  const seq = buildSequence({ kind: "cnvr", n: 12, i: 12, solveFor: "EFF" }, opts("EFF=12.68250301"));
  it("is not verified while any fact is pending", () => {
    const verdict = verdictFor(seq, {});
    expect(verdict.simulation.ok).toBe(true);
    expect(verdict.verified).toBe(false);
    expect(verdict.pendingFacts).toContain("cnvr.screen");
  });
  it("is verified once every fact it uses is confirmed", () => {
    const all = Object.fromEntries(FC200V.facts.map((f) => [f.key, "confirmed" as const]));
    expect(verdictFor(seq, all).verified).toBe(true);
    expect(verdictFor(seq, { ...all, "cnvr.screen": "rejected" }).verified).toBe(false);
  });
  it("only references facts and keys that exist in the model", () => {
    const factKeys = new Set(FC200V.facts.map((f) => f.key));
    for (const key of Object.values(FC200V.keys)) {
      if (key.factKey) expect(factKeys.has(key.factKey)).toBe(true);
    }
    for (const unit of financeStatisticsCourse.units) {
      for (const lesson of unit.lessons) {
        for (const q of lesson.questions) {
          if (!q.calculator) continue;
          const s = buildSequence(q.calculator.plan, opts(q.calculator.expectedDisplay));
          for (const k of s.factKeys) expect(factKeys.has(k)).toBe(true);
        }
      }
    }
  });
});
