export const ROUND_SECONDS = 300;
export const HISTORY_LIMIT = 40;

export type NormieType = "Human" | "Cat" | "Alien" | "Agent" | "Zombie";
export type RunStatus = "success" | "failed";

export type TypeWindow = {
  type: NormieType;
  minRemaining: number;
  maxRemaining: number;
  color: string;
  accent: string;
  tone: string;
  representativeId: number;
};

export type RunRecord = {
  id: string;
  status: RunStatus;
  awardedType: NormieType | null;
  pressedAtSecondsRemaining: number;
  secondsWaited: number;
  timestamp: string;
};

export const TYPE_WINDOWS: TypeWindow[] = [
  {
    type: "Human",
    minRemaining: 241,
    maxRemaining: 300,
    color: "#3667c8",
    accent: "#d8e5ff",
    tone: "#f4f7ff",
    representativeId: 0
  },
  {
    type: "Cat",
    minRemaining: 181,
    maxRemaining: 240,
    color: "#a95d10",
    accent: "#ffe3bc",
    tone: "#fff8ed",
    representativeId: 8831
  },
  {
    type: "Alien",
    minRemaining: 121,
    maxRemaining: 180,
    color: "#1f7b56",
    accent: "#ccefdc",
    tone: "#f0fbf5",
    representativeId: 3295
  },
  {
    type: "Agent",
    minRemaining: 61,
    maxRemaining: 120,
    color: "#6b52b8",
    accent: "#e5ddff",
    tone: "#f7f4ff",
    representativeId: 7626
  },
  {
    type: "Zombie",
    minRemaining: 1,
    maxRemaining: 60,
    color: "#b3263a",
    accent: "#ffd6dc",
    tone: "#fff2f4",
    representativeId: 9572
  }
];

export function getTypeWindow(type: NormieType): TypeWindow {
  const window = TYPE_WINDOWS.find((entry) => entry.type === type);
  if (!window) {
    throw new Error(`Unknown Normies Type: ${type}`);
  }
  return window;
}

export function getTypeForSecondsRemaining(
  secondsRemaining: number
): NormieType | null {
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) {
    return null;
  }

  const normalized = Math.min(ROUND_SECONDS, Math.ceil(secondsRemaining));
  return (
    TYPE_WINDOWS.find(
      (entry) =>
        normalized >= entry.minRemaining && normalized <= entry.maxRemaining
    )?.type ?? null
  );
}

export function getSecondsRemaining(
  startedAtMs: number,
  nowMs: number,
  durationSeconds = ROUND_SECONDS
): number {
  if (nowMs <= startedAtMs) {
    return durationSeconds;
  }

  const remainingMs = startedAtMs + durationSeconds * 1000 - nowMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function formatClock(seconds: number): string {
  const normalized = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function createPressRun(
  secondsRemaining: number,
  timestamp = new Date()
): RunRecord {
  const clampedRemaining = Math.max(
    0,
    Math.min(ROUND_SECONDS, Math.ceil(secondsRemaining))
  );
  const awardedType = getTypeForSecondsRemaining(clampedRemaining);

  return {
    id: createRunId(timestamp),
    status: awardedType ? "success" : "failed",
    awardedType,
    pressedAtSecondsRemaining: clampedRemaining,
    secondsWaited: ROUND_SECONDS - clampedRemaining,
    timestamp: timestamp.toISOString()
  };
}

export function createFailedRun(timestamp = new Date()): RunRecord {
  return {
    id: createRunId(timestamp),
    status: "failed",
    awardedType: null,
    pressedAtSecondsRemaining: 0,
    secondsWaited: ROUND_SECONDS,
    timestamp: timestamp.toISOString()
  };
}

export function canPressRound(
  status: "idle" | "running" | "pressed" | "failed",
  secondsRemaining: number
): boolean {
  return status === "running" && secondsRemaining > 0;
}

export function trimHistory(history: RunRecord[]): RunRecord[] {
  return history.slice(0, HISTORY_LIMIT);
}

export function summarizeHistory(history: RunRecord[]) {
  const successfulRuns = history.filter((run) => run.status === "success");
  const failedRuns = history.length - successfulRuns.length;
  const bestRun =
    successfulRuns
      .slice()
      .sort((a, b) => b.secondsWaited - a.secondsWaited)[0] ?? null;

  const standings = TYPE_WINDOWS.map(({ type }) => {
    const runs = successfulRuns.filter((run) => run.awardedType === type);
    return {
      type,
      runs: runs.length,
      bestSecondsWaited:
        runs.length > 0
          ? Math.max(...runs.map((run) => run.secondsWaited))
          : null,
      latestRun: runs[0] ?? null
    };
  });

  return {
    totalRuns: history.length,
    successfulRuns: successfulRuns.length,
    failedRuns,
    bestRun,
    standings
  };
}

function createRunId(timestamp: Date): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ?? `${timestamp.getTime()}-${Math.random().toString(16).slice(2)}`;
}
