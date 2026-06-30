const ROUND_SECONDS = 60;
const ROUND_MS = ROUND_SECONDS * 1000;
export const FINAL_ROUND_ID = 10000;
const HISTORY_LIMIT = 24;
const HISTORY_STORAGE_KEY = "pressHistory";
const PENDING_NUMBER_STORAGE_KEY = "pendingNumber";
const TYPE_IMAGES_STORAGE_KEY = "typeImages";
const TYPE_IMAGE_SVG_STORAGE_PREFIX = "typeImageSvg:";
const MAX_SUBMITTED_NUMBER = 9999;
const NUMBER_LOG_LIMIT = 250;
const PRESS_THROTTLE_MS = 1000;
const REPEATED_TIMING_LIMIT = 3;
const REPEATED_TIMING_WINDOW_MS = 10 * 60 * 1000;
const NORMIES_API_BASE = "https://api.normies.art";
const PUBLIC_API_BASE = "https://normies-type-button-api.deviantclaw.workers.dev";
const TYPES = ["Human", "Cat", "Alien", "Agent", "Zombie"];
const DEFAULT_TYPE_IMAGE_IDS = {
  Human: 0,
  Cat: 133,
  Alien: 615,
  Agent: 108,
  Zombie: 1
};
const DEFAULT_TYPE_IMAGE_ASSETS = {
  Human: "/assets/normie-type-human.svg",
  Cat: "/assets/normie-type-cat.svg",
  Alien: "/assets/normie-type-alien.svg",
  Agent: "/assets/normie-type-agent.svg",
  Zombie: "/assets/normie-type-zombie.svg"
};
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
  "Access-Control-Allow-Headers": "Content-Type, x-number-log-key, x-reset-key"
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
        return json(await this.pressButton(body.visitorId || "", request));
      }

      if (url.pathname === "/number" && request.method === "POST") {
        const body = await readBody(request);
        return json(
          await this.submitNumber(body.visitorId || "", body.number)
        );
      }

      if (url.pathname.startsWith("/type-image/") && request.method === "GET") {
        return this.readTypeImage(url.pathname);
      }

      if (url.pathname === "/number-log" && request.method === "GET") {
        this.assertNumberLogAccess(request);
        return json(await this.readNumberLog(url.searchParams));
      }

      if (url.pathname === "/press-log" && request.method === "GET") {
        this.assertNumberLogAccess(request);
        return json(await this.readPressLog(url.searchParams));
      }

      if (url.pathname === "/admin/reset" && request.method === "POST") {
        this.assertResetAccess(request);
        return json(await this.resetBackend());
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

    if (normalized.status === "active" || normalized.status === "finale") {
      return this.stateForVisitor(normalized, visitorId, now);
    }

    const nextRound = await this.createActiveRound(
      startingRoundId(normalized),
      now,
      normalized
    );
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now);
  }

  async pressButton(visitorId, request) {
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

    const location = requestLocation(request);
    const throttleKeys = pressThrottleKeys(visitorId, location.ipAddress);
    if (await this.isPressThrottled(throttleKeys, now)) {
      return this.stateForVisitor(round, visitorId, now);
    }
    const timingKeys = pressTimingKeys(visitorId, location.ipAddress);
    const timingBucket = pressTimingBucket(round.expiresAt, now);
    if (await this.isRepeatedTimingBlocked(timingKeys, timingBucket, now)) {
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
      const nextRound = await this.createRoundAfterEnd(round, now);
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
    const pressedRound = {
      ...round,
      status: "active",
      totalPresses: round.totalPresses + 1,
      pressCounts: {
        ...round.pressCounts,
        [type]: round.pressCounts[type] + 1
      },
      lastPress: press
    };

    await this.state.storage.put(pressKey, press);
    await this.logPressEvent({
      ...press,
      pressKey,
      ...location
    });
    await this.markPressThrottle(throttleKeys, now);
    await this.markPressTiming(timingKeys, timingBucket, now);
    const recentPresses = await this.addHistoryPress(press);
    const nextRound = await this.createRoundAfterEnd(pressedRound, now);
    await this.saveRound(nextRound);
    return this.stateForVisitor(nextRound, visitorId, now, recentPresses);
  }

  async isPressThrottled(keys, now) {
    for (const key of keys) {
      const lastPressAt = await this.state.storage.get(key);
      if (
        typeof lastPressAt === "number" &&
        now - lastPressAt < PRESS_THROTTLE_MS
      ) {
        return true;
      }
    }
    return false;
  }

  async markPressThrottle(keys, now) {
    await Promise.all(keys.map((key) => this.state.storage.put(key, now)));
  }

  async isRepeatedTimingBlocked(keys, timingBucket, now) {
    for (const key of keys) {
      const value = await this.state.storage.get(key);
      if (
        value &&
        typeof value === "object" &&
        value.bucket === timingBucket &&
        value.count >= REPEATED_TIMING_LIMIT &&
        typeof value.updatedAt === "number" &&
        now - value.updatedAt < REPEATED_TIMING_WINDOW_MS
      ) {
        return true;
      }
    }
    return false;
  }

  async markPressTiming(keys, timingBucket, now) {
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.state.storage.get(key);
        const count =
          value &&
          typeof value === "object" &&
          value.bucket === timingBucket &&
          typeof value.updatedAt === "number" &&
          now - value.updatedAt < REPEATED_TIMING_WINDOW_MS
            ? Number(value.count) + 1
            : 1;
        await this.state.storage.put(key, {
          bucket: timingBucket,
          count,
          updatedAt: now
        });
      })
    );
  }

  async submitNumber(visitorId, submittedNumber) {
    if (!visitorId) {
      throw new Error("Missing visitor id");
    }

    const now = Date.now();
    const { round, changed } = await this.normalizeRound(now);
    if (changed) {
      await this.saveRound(round);
    }
    if (round.status === "finale") {
      return this.stateForVisitor(round, visitorId, now);
    }

    const value = parseSubmittedNumber(submittedNumber);
    const details = await lookupNormieDetails(value);
    if (!details.normieType) {
      throw new Error("That's not a valid Normies ID #, mate!");
    }

    const imageSvg = await lookupNormieImageSvg(value);
    const imageUrl = typeImageRoute(details.normieType, value, pendingTimestamp(now));
    const pendingNumber = {
      value,
      owner: details.owner,
      normieType: details.normieType,
      imageUrl,
      visitorTag: visitorTag(visitorId),
      timestamp: new Date(now).toISOString()
    };

    await this.logSubmittedNumber({
      tokenId: value,
      owner: details.owner,
      normieType: details.normieType,
      visitorTag: pendingNumber.visitorTag,
      timestamp: pendingNumber.timestamp,
      roundId: round.roundId
    });
    await this.state.storage.put(PENDING_NUMBER_STORAGE_KEY, pendingNumber);
    await this.saveTypeImage(details.normieType, {
      value,
      owner: details.owner,
      normieType: details.normieType,
      imageUrl,
      imageSvg,
      visitorTag: pendingNumber.visitorTag,
      timestamp: pendingNumber.timestamp,
      source: "submitted"
    });

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
    const remaining =
      round.status === "finale"
        ? 0
        : round.expiresAt
          ? secondsRemaining(round.expiresAt, now)
          : ROUND_SECONDS;
    let history = normalizeHistory(
      recentPresses || (await this.getHistory()),
      round
    );
    const pendingNumber = await this.getPendingNumber();
    const stats = this.readPressStats();
    if (round.status === "finale" && history.length === 0 && stats.totalPresses > 0) {
      history = normalizeHistory(await this.readRecentPressHistory(), round);
    }
    const typeImages = await this.getTypeImages();
    const finale =
      round.status === "finale"
        ? createFinaleSummary(stats.typeCounts, round)
        : null;

    return {
      status: round.status,
      gameMode: round.status === "finale" ? "finale" : "active",
      finalRoundId: FINAL_ROUND_ID,
      roundId: round.roundId,
      serverNow: now,
      expiresAt: round.expiresAt,
      remainingSeconds: remaining,
      currentType:
        round.status === "active" ? typeForSecondsRemaining(remaining) : null,
      totalPresses: stats.totalPresses,
      pressCounts: stats.typeCounts,
      lastPress: round.lastPress,
      recentPresses: history,
      featuredNumber: normalizeNumberRecord(round.featuredNumber),
      pendingNumber,
      typeImages,
      stats,
      finale,
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

    if (normalized.status === "finale") {
      return { round: createFinaleRound(normalized), changed: false };
    }

    if (normalized.status === "expired") {
      return {
        round: await this.createRoundAfterEnd(normalized, now),
        changed: true
      };
    }

    if (normalized.status === "active") {
      if (!normalized.expiresAt || normalized.expiresAt <= now) {
        return {
          round: await this.createRoundAfterEnd(normalized, now),
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

  async createActiveRound(roundId, now, previousRound = null) {
    const featuredNumber = await this.consumePendingNumber();
    return createActiveRound(roundId, now, featuredNumber, previousRound);
  }

  async createRoundAfterEnd(round, now) {
    if (round.roundId >= FINAL_ROUND_ID) {
      return createFinaleRound(round);
    }

    const featuredNumber = await this.consumePendingNumber();
    return createActiveRound(round.roundId + 1, now, featuredNumber, round);
  }

  async getPendingNumber() {
    return normalizeNumberRecord(
      await this.state.storage.get(PENDING_NUMBER_STORAGE_KEY)
    );
  }

  async getTypeImages() {
    return normalizeTypeImages(
      await this.state.storage.get(TYPE_IMAGES_STORAGE_KEY)
    );
  }

  async saveTypeImage(type, image) {
    const images = await this.getTypeImages();
    images[type] = normalizeTypeImage(image, type);
    await this.state.storage.put(TYPE_IMAGES_STORAGE_KEY, images);
    if (typeof image.imageSvg === "string" && image.imageSvg.trim()) {
      await this.state.storage.put(typeImageSvgStorageKey(type), image.imageSvg);
    }
  }

  async readTypeImage(pathname) {
    const match = pathname.match(/^\/type-image\/([a-z]+)\.svg$/);
    const type = match ? typeFromSlug(match[1]) : null;
    if (!type) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const svg = await this.state.storage.get(typeImageSvgStorageKey(type));
    if (!svg) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml; charset=UTF-8",
        "Cache-Control": "public, max-age=60, s-maxage=300"
      }
    });
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
    this.ensureSubmittedNumberTable();
    this.state.storage.sql.exec(
      `INSERT INTO submitted_number_log
        (token_id, owner, normie_type, visitor_tag, round_id, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      entry.tokenId,
      entry.owner,
      entry.normieType,
      entry.visitorTag,
      entry.roundId,
      entry.timestamp
    );
  }

  ensureSubmittedNumberTable() {
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS submitted_number_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        owner TEXT,
        normie_type TEXT,
        visitor_tag TEXT NOT NULL,
        round_id INTEGER NOT NULL,
        submitted_at TEXT NOT NULL
      )`
    );
    try {
      this.state.storage.sql.exec(
        "ALTER TABLE submitted_number_log ADD COLUMN normie_type TEXT"
      );
    } catch {}
  }

  async readNumberLog(searchParams) {
    const limit = parseLogLimit(searchParams.get("limit"));
    this.ensureSubmittedNumberTable();

    const rows = [
      ...this.state.storage.sql.exec(
        `SELECT token_id AS tokenId,
          owner,
          normie_type AS normieType,
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

  logPressEvent(entry) {
    this.ensurePressEventTable();
    this.state.storage.sql.exec(
      `INSERT OR IGNORE INTO press_event_log
        (
          press_key,
          round_id,
          type,
          seconds_remaining,
          seconds_waited,
          visitor_tag,
          ip_address,
          country,
          pressed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.pressKey,
      entry.roundId,
      entry.type,
      entry.secondsRemaining,
      entry.secondsWaited,
      entry.visitorTag,
      entry.ipAddress,
      entry.country,
      entry.timestamp
    );
  }

  ensurePressEventTable() {
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS press_event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        press_key TEXT NOT NULL UNIQUE,
        round_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        seconds_remaining INTEGER NOT NULL,
        seconds_waited INTEGER NOT NULL,
        visitor_tag TEXT NOT NULL,
        ip_address TEXT,
        country TEXT,
        pressed_at TEXT NOT NULL
      )`
    );
  }

  readPressStats() {
    this.ensurePressEventTable();
    const totals = [
      ...this.state.storage.sql.exec(
        `SELECT
          COUNT(*) AS totalPresses,
          COUNT(DISTINCT NULLIF(country, '')) AS countryCount
        FROM press_event_log`
      )
    ][0] || { totalPresses: 0, countryCount: 0 };
    const typeRows = [
      ...this.state.storage.sql.exec(
        `SELECT type, COUNT(*) AS presses
        FROM press_event_log
        GROUP BY type`
      )
    ];
    const typeCounts = Object.fromEntries(TYPES.map((type) => [type, 0]));
    for (const row of typeRows) {
      if (TYPES.includes(row.type)) {
        typeCounts[row.type] = Number(row.presses) || 0;
      }
    }
    const sortedTypes = TYPES.map((type) => ({
      type,
      presses: typeCounts[type]
    })).sort((a, b) => b.presses - a.presses);
    const leader = sortedTypes[0];
    const runnerUp = sortedTypes[1];
    const leadMargin = Math.max(0, leader.presses - runnerUp.presses);

    return {
      totalPresses: Number(totals.totalPresses) || 0,
      countryCount: Number(totals.countryCount) || 0,
      typeCounts,
      leadingType: leader.presses > 0 ? leader.type : null,
      leadingCount: leader.presses,
      leadMargin
    };
  }

  async readPressLog(searchParams) {
    const limit = parseLogLimit(searchParams.get("limit"));
    this.ensurePressEventTable();

    const rows = [
      ...this.state.storage.sql.exec(
        `SELECT
          round_id AS roundId,
          type,
          seconds_remaining AS secondsRemaining,
          seconds_waited AS secondsWaited,
          visitor_tag AS visitorTag,
          ip_address AS ipAddress,
          country,
          pressed_at AS pressedAt
        FROM press_event_log
        ORDER BY id DESC
        LIMIT ?`,
        limit
      )
    ];

    return { presses: rows };
  }

  async readRecentPressHistory(limit = HISTORY_LIMIT) {
    this.ensurePressEventTable();

    return [
      ...this.state.storage.sql.exec(
        `SELECT
          round_id AS roundId,
          type,
          seconds_remaining AS secondsRemaining,
          seconds_waited AS secondsWaited,
          visitor_tag AS visitorTag,
          pressed_at AS timestamp
        FROM press_event_log
        ORDER BY id DESC
        LIMIT ?`,
        limit
      )
    ];
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

  async resetBackend() {
    await this.state.storage.deleteAll();
    this.state.storage.sql.exec("DROP TABLE IF EXISTS submitted_number_log");
    this.state.storage.sql.exec("DROP TABLE IF EXISTS press_event_log");
    const round = defaultRound();
    await this.saveRound(round);
    return this.stateForVisitor(round, "", Date.now(), []);
  }

  assertResetAccess(request) {
    const expected = this.env?.RESET_KEY;
    if (!expected) {
      throw new HttpError("Reset access is not configured", 503);
    }

    const url = new URL(request.url);
    const supplied =
      request.headers.get("x-reset-key") || url.searchParams.get("key") || "";

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

export function createActiveRound(
  roundId,
  now,
  featuredNumber = null,
  previousRound = null
) {
  const normalizedPrevious = previousRound
    ? normalizeRoundShape(previousRound)
    : defaultRound();

  if (roundId > FINAL_ROUND_ID) {
    return createFinaleRound(normalizedPrevious);
  }

  return {
    status: "active",
    roundId,
    expiresAt: now + ROUND_MS,
    totalPresses: normalizedPrevious.totalPresses,
    pressCounts: { ...normalizedPrevious.pressCounts },
    lastPress: null,
    featuredNumber: normalizeNumberRecord(featuredNumber)
  };
}

export function createRoundAfterEnd(round, now, featuredNumber = null) {
  const normalized = normalizeRoundShape(round);
  if (normalized.roundId >= FINAL_ROUND_ID) {
    return createFinaleRound(normalized);
  }

  return createActiveRound(
    normalized.roundId + 1,
    now,
    featuredNumber,
    normalized
  );
}

export function createFinaleRound(round) {
  const normalized = normalizeRoundShape(round);

  return {
    ...normalized,
    status: "finale",
    roundId: FINAL_ROUND_ID,
    expiresAt: null,
    featuredNumber: normalizeNumberRecord(normalized.featuredNumber)
  };
}

function startingRoundId(round) {
  if (
    round.status === "idle" &&
    round.roundId === 0 &&
    round.totalPresses === 0
  ) {
    return 0;
  }

  return round.roundId + 1;
}

export function normalizeRoundShape(round) {
  return {
    ...defaultRound(),
    ...round,
    status: round?.status === "finale" ? "finale" : round?.status || "idle",
    roundId:
      typeof round?.roundId === "number"
        ? Math.min(round.roundId, FINAL_ROUND_ID)
        : 0,
    pressCounts: { ...INITIAL_COUNTS, ...(round?.pressCounts || {}) },
    featuredNumber: normalizeNumberRecord(round?.featuredNumber)
  };
}

export function calculateUltimateWinner(typeCounts) {
  const normalizedCounts = Object.fromEntries(
    TYPES.map((type) => [type, Number(typeCounts?.[type]) || 0])
  );
  const winningCount = Math.max(...Object.values(normalizedCounts));
  const winners =
    winningCount > 0
      ? TYPES.filter((type) => normalizedCounts[type] === winningCount)
      : [];

  return {
    winners,
    winningCount,
    isTie: winners.length > 1
  };
}

function createFinaleSummary(typeCounts, round) {
  return {
    ...calculateUltimateWinner(typeCounts),
    roundId: FINAL_ROUND_ID,
    completedAt:
      typeof round.lastPress?.timestamp === "string"
        ? round.lastPress.timestamp
        : null
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
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("That's not a valid Normies ID #, mate!");
  }

  const number = Number.parseInt(raw, 10);
  if (!Number.isInteger(number) || number < 1 || number > MAX_SUBMITTED_NUMBER) {
    throw new Error("That's not a valid Normies ID #, mate!");
  }
  return number;
}

function parseLogLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), NUMBER_LOG_LIMIT);
}

async function lookupNormieDetails(tokenId) {
  const [owner, normieType] = await Promise.all([
    lookupNormieOwner(tokenId),
    lookupNormieType(tokenId)
  ]);
  return { owner, normieType };
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

async function lookupNormieType(tokenId) {
  try {
    const response = await fetch(`${NORMIES_API_BASE}/normie/${tokenId}/metadata`);
    if (!response.ok) return null;
    const data = await response.json();
    const typeTrait = Array.isArray(data.attributes)
      ? data.attributes.find((trait) => trait?.trait_type === "Type")
      : null;
    return TYPES.includes(typeTrait?.value) ? typeTrait.value : null;
  } catch {
    return null;
  }
}

async function lookupNormieImageSvg(tokenId) {
  const response = await fetch(imageUrlForNormie(tokenId));
  if (!response.ok) {
    throw new Error("That's not a valid Normies ID #, mate!");
  }
  return response.text();
}

function imageUrlForNormie(tokenId) {
  return `${NORMIES_API_BASE}/normie/${tokenId}/image.svg`;
}

function typeImageRoute(type, tokenId, timestamp) {
  const cacheKey = encodeURIComponent(`${tokenId}:${timestamp}`);
  return `${PUBLIC_API_BASE}/type-image/${type.toLowerCase()}.svg?v=${cacheKey}`;
}

function pendingTimestamp(now) {
  return new Date(now).toISOString();
}

function normalizeNumberRecord(value) {
  if (!value || typeof value !== "object") return null;

  const candidate = value;
  if (
    !Number.isInteger(candidate.value) ||
    candidate.value < 1 ||
    candidate.value > MAX_SUBMITTED_NUMBER
  ) {
    return null;
  }

  return {
    value: candidate.value,
    owner: typeof candidate.owner === "string" ? candidate.owner : null,
    normieType: TYPES.includes(candidate.normieType)
      ? candidate.normieType
      : null,
    imageUrl:
      typeof candidate.imageUrl === "string"
        ? candidate.imageUrl
        : imageUrlForNormie(candidate.value),
    visitorTag:
      typeof candidate.visitorTag === "string" ? candidate.visitorTag : "----",
    timestamp:
      typeof candidate.timestamp === "string"
        ? candidate.timestamp
        : new Date(0).toISOString()
  };
}

function normalizeTypeImages(value) {
  const stored = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    TYPES.map((type) => [type, normalizeTypeImage(stored[type], type)])
  );
}

function normalizeTypeImage(value, type) {
  const fallbackId = DEFAULT_TYPE_IMAGE_IDS[type];
  const candidate = value && typeof value === "object" ? value : {};
  const rawValue = Number(candidate.value);
  const tokenValue =
    Number.isInteger(rawValue) && rawValue >= 0 && rawValue <= MAX_SUBMITTED_NUMBER
      ? rawValue
      : fallbackId;
  const normieType = TYPES.includes(candidate.normieType)
    ? candidate.normieType
    : type;

  return {
    type,
    value: tokenValue,
    owner: typeof candidate.owner === "string" ? candidate.owner : null,
    normieType,
    imageUrl:
      candidate.source === "submitted"
        ? typeImageRoute(type, tokenValue, candidate.timestamp || "")
        : DEFAULT_TYPE_IMAGE_ASSETS[type],
    visitorTag:
      typeof candidate.visitorTag === "string" ? candidate.visitorTag : "----",
    timestamp:
      typeof candidate.timestamp === "string"
        ? candidate.timestamp
        : new Date(0).toISOString(),
    source: candidate.source === "submitted" ? "submitted" : "default"
  };
}

function typeImageSvgStorageKey(type) {
  return `${TYPE_IMAGE_SVG_STORAGE_PREFIX}${type}`;
}

function typeFromSlug(slug) {
  return TYPES.find((type) => type.toLowerCase() === slug) || null;
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

function pressThrottleKeys(visitorId) {
  return [`pressThrottle:visitor:${visitorId}`];
}

function pressTimingKeys(visitorId, ipAddress) {
  const keys = [`pressTiming:visitor:${visitorId}`];
  if (ipAddress) {
    keys.push(`pressTiming:ip:${ipAddress}`);
  }
  return keys;
}

function pressTimingBucket(expiresAt, now) {
  return Math.max(0, expiresAt - now);
}

function requestLocation(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const firstForwardedIp = forwardedFor.split(",")[0]?.trim() || "";
  return {
    ipAddress:
      request.headers.get("cf-connecting-ip") ||
      firstForwardedIp ||
      request.headers.get("x-real-ip") ||
      null,
    country:
      typeof request.cf?.country === "string" ? request.cf.country : null
  };
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
