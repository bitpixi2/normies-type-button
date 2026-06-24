import {
  ROUND_SECONDS,
  getTypeForSecondsRemaining,
  type NormieType,
  type RunRecord
} from "./game";

const STORAGE_KEY = "normies-type-button:visitor-id";
const DEFAULT_API_BASE = "https://normies-type-button-api.deviantclaw.workers.dev";

const configuredApiBase = import.meta.env.VITE_ARENA_API_URL as
  | string
  | undefined;

export const ARENA_API_BASE = (configuredApiBase || DEFAULT_API_BASE).replace(
  /\/$/,
  ""
);

export type ArenaStatus = "idle" | "active" | "expired";

export type ArenaPress = {
  roundId: number;
  type: NormieType;
  secondsRemaining: number;
  secondsWaited: number;
  timestamp: string;
  visitorTag: string;
};

export type ArenaNumber = {
  value: number;
  owner: string | null;
  normieType: NormieType | null;
  imageUrl: string;
  visitorTag: string;
  timestamp: string;
};

export type ArenaTypeImage = {
  type: NormieType;
  value: number;
  owner: string | null;
  normieType: NormieType;
  imageUrl: string;
  visitorTag: string;
  timestamp: string;
  source: "default" | "submitted";
};

export type ArenaStats = {
  totalPresses: number;
  countryCount: number;
  typeCounts: Record<NormieType, number>;
  leadingType: NormieType | null;
  leadingCount: number;
  leadMargin: number;
};

export type ArenaState = {
  status: ArenaStatus;
  roundId: number;
  serverNow: number;
  expiresAt: number | null;
  remainingSeconds: number;
  currentType: NormieType | null;
  totalPresses: number;
  pressCounts: Record<NormieType, number>;
  lastPress: ArenaPress | null;
  recentPresses: ArenaPress[];
  featuredNumber: ArenaNumber | null;
  pendingNumber: ArenaNumber | null;
  typeImages: Record<NormieType, ArenaTypeImage>;
  stats: ArenaStats;
  visitorPressed: boolean;
  visitorRun: RunRecord | null;
};

export function ensureVisitorId(storage: Storage = window.localStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  storage.setItem(STORAGE_KEY, id);
  return id;
}

export function visitorTag(visitorId: string): string {
  return visitorId.replace(/-/g, "").slice(-4).toUpperCase();
}

export function fallbackArenaState(visitorId: string): ArenaState {
  return {
    status: "idle",
    roundId: 0,
    serverNow: Date.now(),
    expiresAt: null,
    remainingSeconds: ROUND_SECONDS,
    currentType: getTypeForSecondsRemaining(ROUND_SECONDS),
    totalPresses: 0,
    pressCounts: {
      Human: 0,
      Cat: 0,
      Alien: 0,
      Agent: 0,
      Zombie: 0
    },
    lastPress: null,
    recentPresses: [],
    featuredNumber: null,
    pendingNumber: null,
    typeImages: fallbackTypeImages(),
    stats: {
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
    },
    visitorPressed: false,
    visitorRun: null
  };
}

export function fallbackTypeImages(): Record<NormieType, ArenaTypeImage> {
  const defaults: Record<NormieType, { value: number; imageUrl: string }> = {
    Human: { value: 0, imageUrl: "/assets/normie-type-human.svg" },
    Cat: { value: 133, imageUrl: "/assets/normie-type-cat.svg" },
    Alien: { value: 615, imageUrl: "/assets/normie-type-alien.svg" },
    Agent: { value: 108, imageUrl: "/assets/normie-type-agent.svg" },
    Zombie: { value: 1, imageUrl: "/assets/normie-type-zombie.svg" }
  };

  return Object.fromEntries(
    Object.entries(defaults).map(([type, defaults]) => [
      type,
      {
        type: type as NormieType,
        value: defaults.value,
        owner: null,
        normieType: type as NormieType,
        imageUrl: defaults.imageUrl,
        visitorTag: "----",
        timestamp: new Date(0).toISOString(),
        source: "default"
      }
    ])
  ) as Record<NormieType, ArenaTypeImage>;
}

export async function fetchArenaState(visitorId: string): Promise<ArenaState> {
  return requestArena(`/state?visitorId=${encodeURIComponent(visitorId)}`);
}

export async function startArena(visitorId: string): Promise<ArenaState> {
  return requestArena("/start", { visitorId });
}

export async function pressArena(visitorId: string): Promise<ArenaState> {
  return requestArena("/press", { visitorId });
}

export async function submitRoundNumber(
  visitorId: string,
  number: number
): Promise<ArenaState> {
  const response = await fetch(`${ARENA_API_BASE}/number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId, number })
  });
  const payload = (await response.json()) as
    | ArenaState
    | { error?: string; state?: ArenaState };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error ? payload.error : "Invalid number"
    );
  }

  if ("state" in payload && payload.state) {
    return normalizeArenaState(payload.state);
  }

  return normalizeArenaState(payload as ArenaState);
}

async function requestArena(path: string, body?: unknown): Promise<ArenaState> {
  const response = await fetch(`${ARENA_API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json()) as ArenaState | { state: ArenaState };
  const state = normalizeArenaState("state" in payload ? payload.state : payload);

  if (!response.ok) {
    return state;
  }

  return state;
}

function normalizeArenaState(state: ArenaState): ArenaState {
  return {
    ...state,
    typeImages: {
      ...fallbackTypeImages(),
      ...(state.typeImages || {})
    }
  };
}
