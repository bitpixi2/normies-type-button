import { describe, expect, it, vi } from "vitest";
import {
  fallbackProfiles,
  fetchTypeProfiles,
  imageUrlForNormie
} from "./normiesApi";

describe("Normies API helpers", () => {
  it("builds direct image URLs", () => {
    expect(imageUrlForNormie(9572)).toBe(
      "https://api.normies.art/normie/9572/image.svg"
    );
  });

  it("parses live Type counts", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Type: [
          { value: "Human", count: 7000 },
          { value: "Cat", count: 100 },
          { value: "Alien", count: 50 },
          { value: "Agent", count: 40 },
          { value: "Zombie", count: 20 }
        ]
      })
    });

    const profiles = await fetchTypeProfiles(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("https://api.normies.art/rarity/traits");
    expect(profiles.map((profile) => [profile.type, profile.count])).toEqual([
      ["Human", 7000],
      ["Cat", 100],
      ["Alien", 50],
      ["Agent", 40],
      ["Zombie", 20]
    ]);
    expect(profiles.every((profile) => profile.source === "live")).toBe(true);
  });

  it("uses fallback values for missing Types", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Type: [{ value: "Human", count: 7000 }]
      })
    });

    const profiles = await fetchTypeProfiles(fetcher as unknown as typeof fetch);

    expect(profiles.find((profile) => profile.type === "Cat")?.source).toBe(
      "fallback"
    );
    expect(profiles.find((profile) => profile.type === "Zombie")?.count).toBe(
      17
    );
  });

  it("provides bundled fallback profiles", () => {
    const profiles = fallbackProfiles();

    expect(profiles).toHaveLength(5);
    expect(profiles.find((profile) => profile.type === "Zombie")?.count).toBe(
      17
    );
  });
});
