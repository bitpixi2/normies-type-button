const ROUND_SECONDS = 60;
const ROUND_MS = ROUND_SECONDS * 1000;
const HISTORY_LIMIT = 24;
const HISTORY_STORAGE_KEY = "pressHistory";
const PENDING_NUMBER_STORAGE_KEY = "pendingNumber";
const MAX_SUBMITTED_NUMBER = 9999;
const NUMBER_LOG_LIMIT = 250;
const NORMIES_API_BASE = "https://api.normies.art";
const TYPES = ["Human", "Cat", "Alien", "Agent", "Zombie"];
const INITIAL_COUNTS = {
  Human: 0,
  Cat: 0,
  Alien: 0,
  Agent: 0,
  Zombie: 0
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-number-log-key"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const id = env.ARENA.idFromName("global");
    const stub = env.ARENA.get(id);
    return stub.fetch(request);
  }
};

export class ArenaObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === "OPTIONS") {
      return json(null, 204);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/state" && request.method === "GET") {
        return json(
          await this.readState(url.searchParams.get("visitorId") || "")
        );
      }

      if (url.pathname === "/start" && request.method === "POST") {
        const body = await readBody(request);
        return json(await this.startRound(body.visitorId || ""));
      }

      if (url.pathname === "/press" && request.method === "POST") {
        const body = await readBody(request);
        return json(await this.pressButton(body.visitorId || ""));
      }

      if (url.pathname === "/number" && request.method === "POST") {
        const body = await readBody(request);
        return json(
          await this.submitNumber(body.visitorId || "", body.number)
        );
      }

      if (url.pathname === "/number-log" && request.method === "GET") {
        this.assertNumberLogAccess(request);
        return json(await this.readNumberLog(url.searchParams));
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof HttpError) {
        return json({ error: message }, error.status);
      }
      return json({ error: message, state: await this.readState("") }, 400);
    }
  }

  async startRound(visitorId) {
    const now = Date.now();
    const { round: normalized, changed } = await this.normalizeRound(now);
    if (changed) {
      await this.saveRound(normalized);
    }

    if (normalized.status === "active") {
      return this.stateForVisitor(normalized, visitorId, now);
    }

    const nextRound = await this.createActiveRound(normalized.roundId + 1, now);
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now);
  }

  async pressButton(visitorId) {
    if (!visitorId) {
      throw new Error("Missing visitor id");
    }

    const now = Date.now();
    const { round, changed } = await this.normalizeRound(now);
    if (changed) {
      await this.saveRound(round);
    }

    if (round.status !== "active") {
      return this.stateForVisitor(round, visitorId, now);
    }

    const pressKey = pressStorageKey(round.roundId, visitorId);
    const existingPress = await this.state.storage.get(pressKey);
    if (existingPress) {
      return this.stateForVisitor(round, visitorId, now);
    }

    const remainingSeconds = secondsRemaining(round.expiresAt, now);
    const type = typeForSecondsRemaining(remainingSeconds);
    if (!type) {
      const nextRound = await this.createActiveRound(round.roundId + 1, now);
      await this.saveRound(nextRound);
      return this.stateForVisitor(nextRound, visitorId, now);
    }

    const press = {
      roundId: round.roundId,
      type,
      secondsRemaining: remainingSeconds,
      secondsWaited: ROUND_SECONDS - remainingSeconds,
      timestamp: new Date(now).toISOString(),
      visitorTag: visitorTag(visitorId)
    };
    const nextRound = {
      ...round,
      status: "active",
      expiresAt: now + ROUND_MS,
      totalPresses: round.totalPresses + 1,
      pressCounts: {
        ...round.pressCounts,
        [type]: round.pressCounts[type] + 1
      },
      lastPress: press
    };

    await this.state.storage.put(pressKey, press);
    const recentPresses = await this.addHistoryPress(press);
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now, recentPresses);
  }

  async submitNumber(visitorId, submittedNumber) {
    if (!visitorId) {
      throw new Error("Missing visitor id");
    }

    const now = Date.now();
    const value = parseSubmittedNumber(submittedNumber);
    const pendingNumber = {
      value,
      visitorTag: visitorTag(visitorId),
      timestamp: new Date(now).toISOString()
    };

    const { round, changed } = await this.normalizeRound(now);
    const owner = await lookupNormieOwner(value);
    await this.logSubmittedNumber({
      tokenId: value,
      owner,
      visitorTag: pendingNumber.visitorTag,
      timestamp: pendingNumber.timestamp,
      roundId: round.roundId
    });
    await this.state.storage.put(PENDING_NUMBER_STORAGE_KEY, pendingNumber);

    if (changed) {
      await this.saveRound(round);
    }

    return this.stateForVisitor(round, visitorId, now);
  }

  async readState(visitorId) {
    const now = Date.now();
    const { round, changed } = await this.normalizeRound(now);
    if (changed) {
      await this.saveRound(round);
    }

    return this.stateForVisitor(round, visitorId, now);
  }

  async stateForVisitor(round, visitorId, now, recentPresses = null) {
    const visitorPress = visitorId
      ? await this.state.storage.get(pressStorageKey(round.roundId, visitorId))
      : null;
    const remaining = round.expiresAt ? secondsRemaining(round.expiresAt, now) : ROUND_SECONDS;
    const history = normalizeHistory(
      recentPresses || (await this.getHistory()),
      round
    );
    const pendingNumber = await this.getPendingNumber();

    return {
      status: round.status,
      roundId: round.roundId,
      serverNow: now,
      expiresAt: round.expiresAt,
      remainingSeconds: remaining,
      currentType:
        round.status === "active" ? typeForSecondsRemaining(remaining) : null,
      totalPresses: round.totalPresses,
      pressCounts: round.pressCounts,
      lastPress: round.lastPress,
      recentPresses: history,
      featuredNumber: normalizeNumberRecord(round.featuredNumber),
      pendingNumber,
      visitorPressed: Boolean(visitorPress),
      visitorRun: visitorPress
        ? {
            id: `${round.roundId}-${visitorPress.timestamp}-${visitorPress.visitorTag}`,
            status: "success",
            awardedType: visitorPress.type,
            pressedAtSecondsRemaining: visitorPress.secondsRemaining,
            secondsWaited: visitorPress.secondsWaited,
            timestamp: visitorPress.timestamp
          }
        : null
    };
  }

  async getRound() {
    return (await this.state.storage.get("round")) || defaultRound();
  }

  async saveRound(round) {
    await this.state.storage.put("round", round);
  }

  async normalizeRound(now) {
    const normalized = normalizeRoundShape(await this.getRound());

    if (normalized.status === "expired") {
      return {
        round: await this.createActiveRound(normalized.roundId + 1, now),
        changed: true
      };
    }

    if (normalized.status === "active") {
      if (!normalized.expiresAt || normalized.expiresAt <= now) {
        return {
          round: await this.createActiveRound(normalized.roundId + 1, now),
          changed: true
        };
      }

      if (normalized.expiresAt - now > ROUND_MS) {
        return {
          round: { ...normalized, expiresAt: now + ROUND_MS },
          changed: true
        };
      }
    }

    return { round: normalized, changed: false };
  }

  async createActiveRound(roundId, now) {
    const featuredNumber = await this.consumePendingNumber();
    return createActiveRound(roundId, now, featuredNumber);
  }

  async getPendingNumber() {
    return normalizeNumberRecord(
      await this.state.storage.get(PENDING_NUMBER_STORAGE_KEY)
    );
  }

  async consumePendingNumber() {
    const pendingNumber = await this.getPendingNumber();
    if (pendingNumber) {
      await this.state.storage.delete(PENDING_NUMBER_STORAGE_KEY);
    }
    return pendingNumber;
  }

  async getHistory() {
    return (await this.state.storage.get(HISTORY_STORAGE_KEY)) || [];
  }

  async addHistoryPress(press) {
    const nextHistory = normalizeHistory(
      [press, ...(await this.getHistory())],
      { roundId: press.roundId }
    ).slice(0, HISTORY_LIMIT);
    await this.state.storage.put(HISTORY_STORAGE_KEY, nextHistory);
    return nextHistory;
  }

  async logSubmittedNumber(entry) {
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS submitted_number_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        owner TEXT,
        visitor_tag TEXT NOT NULL,
        round_id INTEGER NOT NULL,
        submitted_at TEXT NOT NULL
      )`
    );
    this.state.storage.sql.exec(
      `INSERT INTO submitted_number_log
        (token_id, owner, visitor_tag, round_id, submitted_at)
        VALUES (?, ?, ?, ?, ?)`,
      entry.tokenId,
      entry.owner,
      entry.visitorTag,
      entry.roundId,
      entry.timestamp
    );
  }

  async readNumberLog(searchParams) {
    const limit = parseLogLimit(searchParams.get("limit"));
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS submitted_number_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        owner TEXT,
        visitor_tag TEXT NOT NULL,
        round_id INTEGER NOT NULL,
        submitted_at TEXT NOT NULL
      )`
    );

    const rows = [
      ...this.state.storage.sql.exec(
        `SELECT token_id AS tokenId,
          owner,
          visitor_tag AS visitorTag,
          round_id AS roundId,
          submitted_at AS submittedAt
        FROM submitted_number_log
        ORDER BY id DESC
        LIMIT ?`,
        limit
      )
    ];

    return { submissions: rows };
  }

  assertNumberLogAccess(request) {
    const expected = this.env?.NUMBER_LOG_KEY;
    if (!expected) {
      throw new HttpError("Number log access is not configured", 503);
    }

    const url = new URL(request.url);
    const supplied =
      request.headers.get("x-number-log-key") ||
      url.searchParams.get("key") ||
      "";

    if (supplied !== expected) {
      throw new HttpError("Forbidden", 403);
    }
  }
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function defaultRound() {
  return {
    status: "idle",
    roundId: 0,
    expiresAt: null,
    totalPresses: 0,
    pressCounts: { ...INITIAL_COUNTS },
    lastPress: null,
    featuredNumber: null
  };
}

function createActiveRound(roundId, now, featuredNumber = null) {
  return {
    status: "active",
    roundId,
    expiresAt: now + ROUND_MS,
    totalPresses: 0,
    pressCounts: { ...INITIAL_COUNTS },
    lastPress: null,
    featuredNumber: normalizeNumberRecord(featuredNumber)
  };
}

function normalizeRoundShape(round) {
  return {
    ...defaultRound(),
    ...round,
    pressCounts: { ...INITIAL_COUNTS, ...(round.pressCounts || {}) },
    featuredNumber: normalizeNumberRecord(round.featuredNumber)
  };
}

function normalizeHistory(history, round) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((press) => press && typeof press === "object")
    .map((press) => ({
      roundId:
        typeof press.roundId === "number" ? press.roundId : round.roundId || 0,
      type: TYPES.includes(press.type) ? press.type : "Human",
      secondsRemaining:
        typeof press.secondsRemaining === "number" ? press.secondsRemaining : 0,
      secondsWaited:
        typeof press.secondsWaited === "number" ? press.secondsWaited : 0,
      timestamp:
        typeof press.timestamp === "string"
          ? press.timestamp
          : new Date(0).toISOString(),
      visitorTag:
        typeof press.visitorTag === "string" ? press.visitorTag : "----"
    }))
    .slice(0, HISTORY_LIMIT);
}

function typeForSecondsRemaining(seconds) {
  if (seconds <= 0) return null;
  if (seconds >= 49) return "Human";
  if (seconds >= 37) return "Cat";
  if (seconds >= 25) return "Alien";
  if (seconds >= 13) return "Agent";
  return "Zombie";
}

function parseSubmittedNumber(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isInteger(number) || number < 0 || number > MAX_SUBMITTED_NUMBER) {
    throw new Error(`Number must be between 0 and ${MAX_SUBMITTED_NUMBER}`);
  }
  return number;
}

function parseLogLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), NUMBER_LOG_LIMIT);
}

async function lookupNormieOwner(tokenId) {
  try {
    const response = await fetch(`${NORMIES_API_BASE}/normie/${tokenId}/owner`);
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.owner === "string" ? data.owner : null;
  } catch {
    return null;
  }
}

function normalizeNumberRecord(value) {
  if (!value || typeof value !== "object") return null;

  const candidate = value;
  if (
    !Number.isInteger(candidate.value) ||
    candidate.value < 0 ||
    candidate.value > MAX_SUBMITTED_NUMBER
  ) {
    return null;
  }

  return {
    value: candidate.value,
    visitorTag:
      typeof candidate.visitorTag === "string" ? candidate.visitorTag : "----",
    timestamp:
      typeof candidate.timestamp === "string"
        ? candidate.timestamp
        : new Date(0).toISOString()
  };
}

function secondsRemaining(expiresAt, now) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function visitorTag(visitorId) {
  return visitorId.replace(/-/g, "").slice(-4).toUpperCase();
}

function pressStorageKey(roundId, visitorId) {
  return `press:${roundId}:${visitorId}`;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(payload, status = 200) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
