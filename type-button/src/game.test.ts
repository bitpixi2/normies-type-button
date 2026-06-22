import { describe, expect, it } from "vitest";
import {
  ROUND_SECONDS,
  canPressRound,
  createFailedRun,
  createPressRun,
  formatClock,
  getSecondsRemaining,
  getTypeForSecondsRemaining,
  summarizeHistory,
  trimHistory,
  type RunRecord
} from "./game";

describe("Normies Type windows", () => {
  it("maps countdown windows to Normies Types", () => {
    expect(getTypeForSecondsRemaining(300)).toBe("Human");
    expect(getTypeForSecondsRemaining(241)).toBe("Human");
    expect(getTypeForSecondsRemaining(240)).toBe("Cat");
    expect(getTypeForSecondsRemaining(181)).toBe("Cat");
    expect(getTypeForSecondsRemaining(180)).toBe("Alien");
    expect(getTypeForSecondsRemaining(121)).toBe("Alien");
    expect(getTypeForSecondsRemaining(120)).toBe("Agent");
    expect(getTypeForSecondsRemaining(61)).toBe("Agent");
    expect(getTypeForSecondsRemaining(60)).toBe("Zombie");
    expect(getTypeForSecondsRemaining(1)).toBe("Zombie");
    expect(getTypeForSecondsRemaining(0)).toBeNull();
  });

  it("formats countdown values", () => {
    expect(formatClock(300)).toBe("5:00");
    expect(formatClock(61)).toBe("1:01");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("round logic", () => {
  it("computes remaining seconds from the start time", () => {
    expect(getSecondsRemaining(1_000, 1_000)).toBe(ROUND_SECONDS);
    expect(getSecondsRemaining(1_000, 61_000)).toBe(240);
    expect(getSecondsRemaining(1_000, 301_000)).toBe(0);
  });

  it("only allows one active running press", () => {
    expect(canPressRound("running", 1)).toBe(true);
    expect(canPressRound("running", 0)).toBe(false);
    expect(canPressRound("pressed", 60)).toBe(false);
    expect(canPressRound("failed", 60)).toBe(false);
    expect(canPressRound("idle", 300)).toBe(false);
  });

  it("records the awarded Type and waited time", () => {
    const run = createPressRun(58, new Date("2026-06-22T00:00:00.000Z"));

    expect(run.status).toBe("success");
    expect(run.awardedType).toBe("Zombie");
    expect(run.secondsWaited).toBe(242);
    expect(run.pressedAtSecondsRemaining).toBe(58);
  });

  it("records no Type at zero", () => {
    const run = createFailedRun(new Date("2026-06-22T00:00:00.000Z"));

    expect(run.status).toBe("failed");
    expect(run.awardedType).toBeNull();
    expect(run.secondsWaited).toBe(300);
  });
});

describe("history summaries", () => {
  it("summarizes local standings and best run", () => {
    const runs: RunRecord[] = [
      createPressRun(40, new Date("2026-06-22T00:00:03.000Z")),
      createPressRun(200, new Date("2026-06-22T00:00:02.000Z")),
      createFailedRun(new Date("2026-06-22T00:00:01.000Z"))
    ];

    const summary = summarizeHistory(runs);

    expect(summary.totalRuns).toBe(3);
    expect(summary.successfulRuns).toBe(2);
    expect(summary.failedRuns).toBe(1);
    expect(summary.bestRun?.awardedType).toBe("Zombie");
    expect(
      summary.standings.find((standing) => standing.type === "Zombie")
        ?.bestSecondsWaited
    ).toBe(260);
  });

  it("limits stored history length", () => {
    const runs = Array.from({ length: 45 }, (_, index) =>
      createPressRun(300 - index, new Date(2026, 5, 22, 0, 0, index))
    );

    expect(trimHistory(runs)).toHaveLength(40);
  });
});
