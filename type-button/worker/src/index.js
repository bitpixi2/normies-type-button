const ROUND_SECONDS = 300;
const ROUND_MS = ROUND_SECONDS * 1000;
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
    const current = await this.getRound();
    const normalized = normalizeRound(current, now);

    if (normalized.status === "active") {
      return this.stateForVisitor(normalized, visitorId, now);
    }

    const nextRound = {
      status: "active",
      roundId: normalized.roundId + 1,
      expiresAt: now + ROUND_MS,
      totalPresses: 0,
      pressCounts: { ...INITIAL_COUNTS },
      lastPress: null
    };
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now);
  }

  async pressButton(visitorId) {
    if (!visitorId) {
      throw new Error("Missing visitor id");
    }

    const now = Date.now();
    const round = normalizeRound(await this.getRound(), now);
    if (round.status !== "active") {
      await this.saveRound(round);
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
      const expired = { ...round, status: "expired" };
      await this.saveRound(expired);
      return this.stateForVisitor(expired, visitorId, now);
    }

    const press = {
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
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now);
  }

  async readState(visitorId) {
    const now = Date.now();
    const round = normalizeRound(await this.getRound(), now);
    if (round.status === "expired") {
      await this.saveRound(round);
    }

    return this.stateForVisitor(round, visitorId, now);
  }

  async stateForVisitor(round, visitorId, now) {
    const visitorPress = visitorId
      ? await this.state.storage.get(pressStorageKey(round.roundId, visitorId))
      : null;
    const remaining = round.expiresAt ? secondsRemaining(round.expiresAt, now) : ROUND_SECONDS;

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

function normalizeRound(round, now) {
  const normalized = {
    ...defaultRound(),
    ...round,
    pressCounts: { ...INITIAL_COUNTS, ...(round.pressCounts || {}) }
  };

  if (
    normalized.status === "active" &&
    normalized.expiresAt &&
    normalized.expiresAt <= now
  ) {
    return { ...normalized, status: "expired", expiresAt: normalized.expiresAt };
  }

  return normalized;
}

function typeForSecondsRemaining(seconds) {
  if (seconds <= 0) return null;
  if (seconds >= 241) return "Human";
  if (seconds >= 181) return "Cat";
  if (seconds >= 121) return "Alien";
  if (seconds >= 61) return "Agent";
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
