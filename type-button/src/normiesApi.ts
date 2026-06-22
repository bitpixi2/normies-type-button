import { TYPE_WINDOWS, type NormieType } from "./game";

const API_BASE = "https://api.normies.art";

type TraitCount = {
  value: string;
  count: number;
};

type RarityTraitsResponse = {
  Type?: TraitCount[];
};

export type TypeProfile = {
  type: NormieType;
  count: number;
  representativeId: number;
  imageUrl: string;
  source: "live" | "fallback";
};

const FALLBACK_COUNTS: Record<NormieType, number> = {
  Human: 7189,
  Cat: 107,
  Alien: 59,
  Agent: 42,
  Zombie: 17
};

export function imageUrlForNormie(id: number): string {
  return `${API_BASE}/normie/${id}/image.svg`;
}

export function fallbackProfiles(): TypeProfile[] {
  return TYPE_WINDOWS.map(({ type, representativeId }) => ({
    type,
    count: FALLBACK_COUNTS[type],
    representativeId,
    imageUrl: imageUrlForNormie(representativeId),
    source: "fallback"
  }));
}

export async function fetchTypeProfiles(
  fetcher: typeof fetch = fetch
): Promise<TypeProfile[]> {
  const response = await fetcher(`${API_BASE}/rarity/traits`);
  if (!response.ok) {
    throw new Error(`Normies API responded with ${response.status}`);
  }

  const data = (await response.json()) as RarityTraitsResponse;
  const liveCounts = new Map(
    (data.Type ?? []).map((entry) => [entry.value, Number(entry.count)])
  );

  return TYPE_WINDOWS.map(({ type, representativeId }) => ({
    type,
    count: liveCounts.get(type) ?? FALLBACK_COUNTS[type],
    representativeId,
    imageUrl: imageUrlForNormie(representativeId),
    source: liveCounts.has(type) ? "live" : "fallback"
  }));
}
