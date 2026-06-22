const ROUND_SECONDS = 60;
const ROUND_MS = ROUND_SECONDS * 1000;
const HISTORY_LIMIT = 24;
const HISTORY_STORAGE_KEY = "pressHistory";
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
  "Access-Control-Allow-Headers": "Content-Type"
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
  constructor(state) {
    this.state = state;
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

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return json({ error: message, state: await this.readState("") }, 400);
    }
  }

  async startRound(visitorId) {
    const now = Date.now();
    const { round: normalized, changed } = normalizeRound(
      await this.getRound(),
      now
    );
    if (changed) {
      await this.saveRound(normalized);
    }

    if (normalized.status === "active") {
      return this.stateForVisitor(normalized, visitorId, now);
    }

    const nextRound = createActiveRound(normalized.roundId + 1, now);
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now);
  }

  async pressButton(visitorId) {
    if (!visitorId) {
      throw new Error("Missing visitor id");
    }

    const now = Date.now();
    const { round, changed } = normalizeRound(await this.getRound(), now);
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
      const nextRound = createActiveRound(round.roundId + 1, now);
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

  async readState(visitorId) {
    const now = Date.now();
    const { round, changed } = normalizeRound(await this.getRound(), now);
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
}

function defaultRound() {
  return {
    status: "idle",
    roundId: 0,
    expiresAt: null,
    totalPresses: 0,
    pressCounts: { ...INITIAL_COUNTS },
    lastPress: null
  };
}

function createActiveRound(roundId, now) {
  return {
    status: "active",
    roundId,
    expiresAt: now + ROUND_MS,
    totalPresses: 0,
    pressCounts: { ...INITIAL_COUNTS },
    lastPress: null
  };
}

function normalizeRound(round, now) {
  const normalized = {
    ...defaultRound(),
    ...round,
    pressCounts: { ...INITIAL_COUNTS, ...(round.pressCounts || {}) }
  };

  if (normalized.status === "expired") {
    return {
      round: createActiveRound(normalized.roundId + 1, now),
      changed: true
    };
  }

  if (normalized.status === "active") {
    if (!normalized.expiresAt || normalized.expiresAt <= now) {
      return {
        round: createActiveRound(normalized.roundId + 1, now),
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
