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
  visitorTag: string;
  timestamp: string;
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
    return payload.state;
  }

  return payload as ArenaState;
}

async function requestArena(path: string, body?: unknown): Promise<ArenaState> {
  const response = await fetch(`${ARENA_API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json()) as ArenaState | { state: ArenaState };
  const state = "state" in payload ? payload.state : payload;

  if (!response.ok) {
    return state;
  }

  return state;
}
