import { describe, expect, it } from "vitest";
import {
  formatGlobalLeadCopy,
  formatUltimateWinnerCopy,
  normalizeNormieIdInput
} from "./App";

describe("Normie ID input", () => {
  it("accepts plain and hash-prefixed Normies IDs", () => {
    expect(normalizeNormieIdInput("1")).toBe(1);
    expect(normalizeNormieIdInput("#1")).toBe(1);
    expect(normalizeNormieIdInput("  #9999  ")).toBe(9999);
  });

  it("rejects invalid Normies ID entries", () => {
    expect(normalizeNormieIdInput("")).toBeNull();
    expect(normalizeNormieIdInput("#")).toBeNull();
    expect(normalizeNormieIdInput("mate")).toBeNull();
    expect(normalizeNormieIdInput("1abc")).toBeNull();
    expect(normalizeNormieIdInput("0")).toBeNull();
    expect(normalizeNormieIdInput("10000")).toBeNull();
  });
});

describe("Global leaderboard copy", () => {
  it("reports a real leader with a positive margin", () => {
    expect(
      formatGlobalLeadCopy({
        totalPresses: 8,
        countryCount: 1,
        typeCounts: {
          Human: 5,
          Cat: 3,
          Alien: 0,
          Agent: 0,
          Zombie: 0
        },
        leadingType: "Human",
        leadingCount: 5,
        leadMargin: 2
      })
    ).toBe("Humans leading by 2 total presses");
  });

  it("reports tied leaders instead of a zero-margin lead", () => {
    expect(
      formatGlobalLeadCopy({
        totalPresses: 12,
        countryCount: 1,
        typeCounts: {
          Human: 6,
          Cat: 6,
          Alien: 0,
          Agent: 0,
          Zombie: 0
        },
        leadingType: "Human",
        leadingCount: 6,
        leadMargin: 0
      })
    ).toBe("Humans and Cats tied at 6...");
  });

  it("reports no leader before any global presses", () => {
    expect(
      formatGlobalLeadCopy({
        totalPresses: 0,
        countryCount: 0,
        typeCounts: {
          Human: 0,
          Cat: 0,
          Alien: 0,
          Agent: 0,
          Zombie: 0
        },
        leadingType: null,
        leadingCount: 0,
        leadMargin: 0
      })
    ).toBe("No Type leading yet");
  });
});

describe("Ultimate winner copy", () => {
  it("reports a single ultimate Type winner", () => {
    expect(
      formatUltimateWinnerCopy({
        winners: ["Zombie"],
        winningCount: 44,
        isTie: false,
        roundId: 10000,
        completedAt: "2026-06-30T00:00:00.000Z"
      })
    ).toBe("Zombies win with 44 presses");
  });

  it("reports ultimate Type ties", () => {
    expect(
      formatUltimateWinnerCopy({
        winners: ["Human", "Cat"],
        winningCount: 12,
        isTie: true,
        roundId: 10000,
        completedAt: null
      })
    ).toBe("Humans and Cats share the win at 12 presses");
  });

  it("has a no-press finale fallback", () => {
    expect(
      formatUltimateWinnerCopy({
        winners: [],
        winningCount: 0,
        isTie: false,
        roundId: 10000,
        completedAt: null
      })
    ).toBe("No Type won. The button outlasted everyone.");
  });
});
