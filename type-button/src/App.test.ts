import { describe, expect, it } from "vitest";
import { normalizeNormieIdInput } from "./App";

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
