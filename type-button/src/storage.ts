import { HISTORY_LIMIT, type RunRecord, trimHistory } from "./game";

const STORAGE_KEY = "normies-type-button:runs";

export function loadRunHistory(storage: Storage = window.localStorage): RunRecord[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRunRecord).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveRunHistory(
  history: RunRecord[],
  storage: Storage = window.localStorage
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(trimHistory(history)));
}

export function prependRunRecord(
  run: RunRecord,
  history: RunRecord[],
  storage: Storage = window.localStorage
): RunRecord[] {
  const nextHistory = trimHistory([run, ...history]);
  saveRunHistory(nextHistory, storage);
  return nextHistory;
}

export function clearRunHistory(storage: Storage = window.localStorage): void {
  storage.removeItem(STORAGE_KEY);
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RunRecord>;
  return (
    typeof candidate.id === "string" &&
    (candidate.status === "success" || candidate.status === "failed") &&
    (typeof candidate.awardedType === "string" ||
      candidate.awardedType === null) &&
    typeof candidate.pressedAtSecondsRemaining === "number" &&
    typeof candidate.secondsWaited === "number" &&
    typeof candidate.timestamp === "string"
  );
}
