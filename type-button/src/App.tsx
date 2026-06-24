import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROUND_SECONDS,
  TYPE_WINDOWS,
  formatClock,
  getSecondsRemainingUntil,
  getTypeForSecondsRemaining
} from "./game";
import {
  fallbackArenaState,
  fetchArenaState,
  pressArena,
  startArena,
  ensureVisitorId,
  submitRoundNumber,
  type ArenaPress,
  type ArenaState
} from "./arenaApi";
import {
  fallbackProfiles,
  fetchTypeProfiles,
  type TypeProfile
} from "./normiesApi";
import {
  PixelArrow
} from "./pixelSprites";

const POLL_MS = 1000;
const HISTORY_VISIBLE_LIMIT = 5;
const MOBILE_HISTORY_VISIBLE_LIMIT = 3;
const HISTORY_FLASH_MS = 900;
const BUTTON_TAP_FEEDBACK_MS = 180;
type InfoModal = "terms" | "privacy" | null;

const configuredIdlePauseMs = Number.parseInt(
  import.meta.env.VITE_IDLE_PAUSE_MS || "",
  10
);
const IDLE_PAUSE_MS = Number.isFinite(configuredIdlePauseMs)
  ? configuredIdlePauseMs
  : 5 * 60 * 1000;

export function App() {
  const visitorId = useMemo(() => ensureVisitorId(), []);
  const [profiles, setProfiles] = useState<TypeProfile[]>(fallbackProfiles);
  const [arena, setArena] = useState<ArenaState>(() =>
    fallbackArenaState(visitorId)
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [isBusy, setIsBusy] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [numberError, setNumberError] = useState("");
  const [isNumberBusy, setIsNumberBusy] = useState(false);
  const [flashedPressKey, setFlashedPressKey] = useState<string | null>(null);
  const [isButtonTapping, setIsButtonTapping] = useState(false);
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);

  const syncArenaState = useCallback(async () => {
    try {
      const state = await fetchArenaState(visitorId);
      setArena(state);
    } catch {}
  }, [visitorId]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current);
    }

    idleTimeoutRef.current = window.setTimeout(() => {
      setIsIdlePaused(true);
      idleTimeoutRef.current = null;
    }, IDLE_PAUSE_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchTypeProfiles()
      .then((nextProfiles) => {
        if (!cancelled) {
          setProfiles(nextProfiles);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles(fallbackProfiles());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isIdlePaused) {
      return undefined;
    }

    void syncArenaState();
    const pollId = window.setInterval(syncArenaState, POLL_MS);
    return () => {
      window.clearInterval(pollId);
    };
  }, [isIdlePaused, syncArenaState]);

  useEffect(() => {
    if (isIdlePaused) {
      return undefined;
    }

    const handleActivity = () => resetIdleTimer();
    resetIdleTimer();
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, [isIdlePaused, resetIdleTimer]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!infoModal) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfoModal(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [infoModal]);

  const adjustedNow = nowMs + (arena.serverNow - Date.now());
  const displayedRemaining =
    arena.status === "active" && arena.expiresAt
      ? Math.min(
          ROUND_SECONDS,
          getSecondsRemainingUntil(arena.expiresAt, adjustedNow)
        )
      : ROUND_SECONDS;
  const activeType =
    arena.status === "active"
      ? getTypeForSecondsRemaining(displayedRemaining)
      : null;
  const displayedType = arena.status === "active" ? activeType ?? "None" : "Ready";
  const activeTypeGlyph = activeType ? typeGlyphSrc(activeType) : null;
  const progress =
    arena.status === "active"
      ? ((ROUND_SECONDS - displayedRemaining) / ROUND_SECONDS) * 100
      : 0;
  const ownType = arena.visitorRun?.awardedType ?? null;
  const recentPresses = useMemo(
    () =>
      arena.recentPresses?.length > 0
        ? arena.recentPresses.slice(0, HISTORY_VISIBLE_LIMIT)
        : arena.lastPress
          ? [arena.lastPress]
          : [],
    [arena.lastPress, arena.recentPresses]
  );
  const actionLabel = buttonLabel(arena);
  const visibleButtonLabel =
    arena.status === "active" && arena.visitorPressed ? "Wait" : "Press";

  useEffect(() => {
    const renderGameToText = () =>
      JSON.stringify({
        surface: "HTML UI, origin at top-left, x right, y down",
        status: arena.status,
        roundId: arena.roundId,
        currentType: activeType,
        displayedRemaining,
        totalPresses: arena.totalPresses,
        visitorPressed: arena.visitorPressed,
        visitorType: ownType,
        lastPress: arena.lastPress,
        recentPresses,
        featuredNumber: arena.featuredNumber,
        pendingNumber: arena.pendingNumber,
        stats: arena.stats
      });

    window.render_game_to_text = renderGameToText;
    return () => {
      if (window.render_game_to_text === renderGameToText) {
        delete window.render_game_to_text;
      }
    };
  }, [activeType, arena, displayedRemaining, ownType, recentPresses]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (tapTimeoutRef.current !== null) {
        window.clearTimeout(tapTimeoutRef.current);
      }
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const flashHistoryPress = (press: ArenaPress) => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }

    setFlashedPressKey(historyPressKey(press));
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashedPressKey(null);
      flashTimeoutRef.current = null;
    }, HISTORY_FLASH_MS);
  };

  const handleAction = async () => {
    if (isBusy || (arena.status === "active" && arena.visitorPressed)) {
      return;
    }

    triggerButtonFeedback();
    setIsBusy(true);
    try {
      const state =
        arena.status === "active"
          ? await pressArena(visitorId)
          : await startArena(visitorId);
      setArena(state);

      const latestPress = state.recentPresses?.[0] ?? state.lastPress;
      if (latestPress) {
        flashHistoryPress(latestPress);
      }
    } catch {
      // Keep the existing round visible if the shared API hiccups.
    } finally {
      setIsBusy(false);
    }
  };

  const handleResume = () => {
    setIsIdlePaused(false);
    resetIdleTimer();
    void syncArenaState();
  };

  const triggerButtonFeedback = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(20);
    }

    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current);
    }

    setIsButtonTapping(true);
    tapTimeoutRef.current = window.setTimeout(() => {
      setIsButtonTapping(false);
      tapTimeoutRef.current = null;
    }, BUTTON_TAP_FEEDBACK_MS);
  };

  const handleNumberSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNumberBusy) return;

    const parsedNumber = normalizeNormieIdInput(numberInput);
    if (parsedNumber === null) {
      setNumberError("That's not a valid Normies ID #, mate!");
      return;
    }

    setNumberError("");
    setIsNumberBusy(true);
    try {
      const state = await submitRoundNumber(visitorId, parsedNumber);
      setArena(state);
      setNumberInput("");
    } catch {
      setNumberError("That's not a valid Normies ID #, mate!");
    } finally {
      setIsNumberBusy(false);
    }
  };

  return (
    <div className="app">
      <main className="layout">
        <section className="arena" aria-label="Current Type window">
          <div className="arena-header">
            <h1 className="brand-logo-title">
              <img
                alt="Normies Button"
                className="brand-logo"
                height="353"
                src="/assets/normies-button-logo.png"
                width="760"
              />
            </h1>
            <div className="type-readout">
              {activeTypeGlyph && (
                <img
                  alt=""
                  aria-hidden="true"
                  className="active-type-glyph"
                  height="96"
                  src={activeTypeGlyph}
                  width="96"
                />
              )}
              <span>{displayedType}</span>
            </div>
          </div>

          <div className="button-console">
            <div className="stack-wrap" aria-label="Type stack">
              {TYPE_WINDOWS.map((window) => {
                const profile = profiles.find(
                  (entry) => entry.type === window.type
                );
                const isActive = activeType === window.type;
                return (
                  <div
                    className={`stack-row ${isActive ? "is-active" : ""}`}
                    key={window.type}
                  >
                    {isActive && (
                      <span className="stack-arrow" aria-hidden="true">
                        <PixelArrow />
                      </span>
                    )}
                    <div className="normie-tile">
                      <img
                        src={profile?.imageUrl}
                        alt={`Normie ${profile?.representativeId ?? ""}`}
                        width="48"
                        height="48"
                      />
                    </div>
                    <strong>{window.type}</strong>
                    <span>
                      {formatClock(window.maxRemaining)}-
                      {formatClock(window.minRemaining)}
                    </span>
                    <em>{arena.pressCounts[window.type]}</em>
                  </div>
                );
              })}
            </div>

            <div className="clock-shell" aria-live="polite">
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="clock">{formatClock(displayedRemaining)}</div>
              <button
                className={`button-core ${
                  arena.status === "active" && arena.visitorPressed
                    ? "is-pressed"
                    : ""
                } ${isButtonTapping ? "is-tapping" : ""}`}
                type="button"
                onClick={handleAction}
                aria-label={actionLabel}
                disabled={
                  isBusy || (arena.status === "active" && arena.visitorPressed)
                }
              >
                <span className="generated-button-sprite" aria-hidden="true" />
                <span className="button-action-label">
                  {visibleButtonLabel}
                </span>
              </button>
            </div>
          </div>

          <div className="result-line">
            {arena.status === "idle" && <span>Start the shared timer</span>}
            {arena.status === "expired" && <span>Next round is starting</span>}
            {arena.status === "active" && !arena.visitorPressed && activeType && (
              <span>
                <span className="result-sentence">
                  {activeType} window active.
                </span>
                {" "}
                <span className="result-sentence">
                  One press this round.
                </span>
              </span>
            )}
            {arena.status === "active" && arena.visitorPressed && ownType && (
              <span>
                You pressed as {ownType}. Wait for round {arena.roundId + 1}
              </span>
            )}
          </div>
        </section>

        <section
          className={`scoreboard ${isBusy ? "is-loading-history" : ""}`}
          aria-label="Shared standings"
        >
          <div className="score-heading">
            <div>
              <h2>Round {arena.roundId}</h2>
            </div>
          </div>

          <section className="number-panel" aria-label="Next round number">
            <form className="number-form" onSubmit={handleNumberSubmit}>
              <label htmlFor="round-number">Send In Normie #</label>
              <div className="number-entry">
                <input
                  id="round-number"
                  aria-describedby={numberError ? "round-number-error" : undefined}
                  aria-invalid={numberError ? "true" : "false"}
                  inputMode="text"
                  onChange={(event) => {
                    setNumberInput(event.target.value);
                    if (numberError) setNumberError("");
                  }}
                  pattern="#?[0-9]*"
                  type="text"
                  value={numberInput}
                />
                <button type="submit" disabled={isNumberBusy}>
                  {isNumberBusy ? "..." : "Send"}
                </button>
              </div>
            </form>
            {numberError && (
              <div className="number-error" id="round-number-error" role="alert">
                {numberError}
              </div>
            )}

            <div className="number-help">
              They will show when the next round starts!
            </div>
          </section>

          <GlobalStats stats={arena.stats} />

          <div className="history-heading">
            <span className="eyebrow">Live History</span>
            <span className="history-limit history-limit-wide">
              latest {HISTORY_VISIBLE_LIMIT}
            </span>
            <span className="history-limit history-limit-mobile">
              latest {MOBILE_HISTORY_VISIBLE_LIMIT}
            </span>
          </div>

          <div className="history-list">
            {recentPresses.map((press, index) => (
              <div
                className={`history-run ${
                  flashedPressKey === historyPressKey(press) ? "is-new" : ""
                }`}
                key={`${historyPressKey(press)}-${index}`}
              >
                <span className="run-dot" />
                <div className="history-main">
                  <strong>{press.type}</strong>
                  <span>
                    R{press.roundId ?? arena.roundId} #{press.visitorTag}
                  </span>
                </div>
                <div className="history-times">
                  <span>{formatClock(press.secondsWaited)} wait</span>
                  <span>{formatClock(press.secondsRemaining)} left</span>
                </div>
              </div>
            ))}
            {recentPresses.length === 0 && (
              <div className="empty-state">No presses</div>
            )}
          </div>
        </section>

      </main>
      <footer className="site-footer" aria-label="Site links">
        <span>
          Made by{" "}
          <a href="https://bitpixi.com" rel="noreferrer" target="_blank">
            bitpixi
          </a>
        </span>
        <button type="button" onClick={() => setInfoModal("terms")}>
          Terms
        </button>
        <button type="button" onClick={() => setInfoModal("privacy")}>
          Privacy
        </button>
        <a href="https://github.com/bitpixi2" rel="noreferrer" target="_blank">
          GitHub
        </a>
        <a
          href="https://github.com/bitpixi2/normies-button"
          rel="noreferrer"
          target="_blank"
        >
          Repo
        </a>
      </footer>
      {infoModal && (
        <InfoDialog kind={infoModal} onClose={() => setInfoModal(null)} />
      )}
      {isIdlePaused && (
        <div className="idle-overlay" role="dialog" aria-modal="true">
          <div className="idle-module">
            <button
              className="idle-resume-button"
              type="button"
              onClick={handleResume}
            >
              Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoDialog({
  kind,
  onClose
}: {
  kind: Exclude<InfoModal, null>;
  onClose: () => void;
}) {
  const isPrivacy = kind === "privacy";

  return (
    <div className="info-overlay" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="info-dialog-title"
        aria-modal="true"
        className="info-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="info-dialog-heading">
          <h2 id="info-dialog-title">
            {isPrivacy ? "Privacy Policy" : "Terms"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {isPrivacy ? <PrivacyCopy /> : <TermsCopy />}
      </section>
    </div>
  );
}

function TermsCopy() {
  return (
    <div className="info-copy">
      <p>
        Normies Button is an experimental shared timing game built for the
        Normies hackathon.
      </p>
      <p>
        Use it normally: press once per round, send in a Normie number if you
        want it considered for the next round, and do not attack, spam, scrape,
        or interfere with the service.
      </p>
      <p>
        The app is provided as-is for play and judging. It may change, reset, or
        go offline during development.
      </p>
    </div>
  );
}

function PrivacyCopy() {
  return (
    <div className="info-copy">
      <p>
        The app stores button press events so it can show global stats like
        total presses, countries represented, and which Type is leading.
      </p>
      <p>
        When you press, it records the round, Type window, timing, timestamp,
        a short anonymous visitor tag, IP address, and country/general location
        from request metadata. Public stats are aggregated; raw IP addresses are
        not shown on the page.
      </p>
      <p>
        When you send in a Normie ID, the backend stores that ID, the resolved
        owner wallet and Type from the Normies API, the round, timestamp, and
        visitor tag. The app does not ask for your name, email, or wallet.
      </p>
    </div>
  );
}

function buttonLabel(arena: ArenaState): string {
  if (arena.status === "active" && arena.visitorPressed) return "Wait";
  if (arena.status === "active") return "Press";
  if (arena.status === "expired") return "Revive";
  return "Start";
}

function historyPressKey(press: ArenaPress): string {
  return `${press.roundId}-${press.timestamp}-${press.visitorTag}`;
}

function typeGlyphSrc(type: string): string {
  return `/assets/type-${type.toLowerCase()}-glyph.png`;
}

function formatSubmittedNumber(value: number): string {
  return value.toString().padStart(4, "0");
}

function GlobalStats({ stats: rawStats }: { stats: ArenaState["stats"] }) {
  const stats = rawStats ?? {
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
  };
  const leadingCopy = stats.leadingType
    ? `${pluralizeType(stats.leadingType)} leading by ${stats.leadMargin} ${pluralizePress(stats.leadMargin)}`
    : "No Type leading yet";

  return (
    <section className="global-leaderboard" aria-label="Global Leaderboard">
      <h3>Global Leaderboard</h3>
      <div className="global-stats">
        <div className="stat-chip">
          <strong>{stats.totalPresses.toLocaleString()}</strong>
          <span>{pluralizePress(stats.totalPresses)}</span>
        </div>
        <div className="stat-chip">
          <strong>{stats.countryCount.toLocaleString()}</strong>
          <span>{pluralizeCountry(stats.countryCount)}</span>
        </div>
        <div className="stat-chip stat-chip-wide">{leadingCopy}</div>
      </div>
    </section>
  );
}

export function normalizeNormieIdInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^#?\d+$/.test(trimmed)) {
    return null;
  }

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^\d+$/.test(withoutHash)) {
    return null;
  }

  const value = Number.parseInt(withoutHash, 10);
  if (!Number.isInteger(value) || value < 1 || value > 9999) {
    return null;
  }

  return value;
}

function pluralizePress(count: number): string {
  return count === 1 ? "press" : "presses";
}

function pluralizeCountry(count: number): string {
  return count === 1 ? "country" : "countries";
}

function pluralizeType(type: string): string {
  if (type === "Zombie") return "Zombies";
  return `${type}s`;
}
