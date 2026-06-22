import { beforeEach, describe, expect, it } from "vitest";
import { createPressRun, type RunRecord } from "./game";
import {
  clearRunHistory,
  loadRunHistory,
  prependRunRecord,
  saveRunHistory
} from "./storage";

describe("run history storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads an empty history when nothing is saved", () => {
    expect(loadRunHistory()).toEqual([]);
  });

  it("persists and reloads run records", () => {
    const run = createPressRun(120, new Date("2026-06-22T00:00:00.000Z"));

    saveRunHistory([run]);

    expect(loadRunHistory()).toEqual([run]);
  });

  it("prepends new runs and trims the saved list", () => {
    let history: RunRecord[] = [];

    for (let index = 0; index < 45; index += 1) {
      history = prependRunRecord(
        createPressRun(300 - index, new Date(2026, 5, 22, 0, 0, index)),
        history
      );
    }

    expect(history).toHaveLength(40);
    expect(loadRunHistory()).toHaveLength(40);
  });

  it("ignores malformed storage", () => {
    localStorage.setItem("normies-type-button:runs", "{not json");

    expect(loadRunHistory()).toEqual([]);
  });

  it("clears saved history", () => {
    saveRunHistory([createPressRun(60)]);

    clearRunHistory();

    expect(loadRunHistory()).toEqual([]);
  });
});
