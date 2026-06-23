import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  PixelArrow,
  PixelIcon
} from "./pixelSprites";

const POLL_MS = 1000;
const HISTORY_VISIBLE_LIMIT = 5;
const HISTORY_FLASH_MS = 900;

export function App() {
  const visitorId = useMemo(() => ensureVisitorId(), []);
  const [profiles, setProfiles] = useState<TypeProfile[]>(fallbackProfiles);
  const [arena, setArena] = useState<ArenaState>(() =>
    fallbackArenaState(visitorId)
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [isBusy, setIsBusy] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [isNumberBusy, setIsNumberBusy] = useState(false);
  const [flashedPressKey, setFlashedPressKey] = useState<string | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

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
    let cancelled = false;

    const syncState = async () => {
      try {
        const state = await fetchArenaState(visitorId);
        if (!cancelled) {
          setArena(state);
        }
      } catch {}
    };

    void syncState();
    const pollId = window.setInterval(syncState, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [visitorId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

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
    arena.status === "active" && arena.visitorPressed ? "Wait" : "";

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
        pendingNumber: arena.pendingNumber
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

  const handleNumberSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNumberBusy) return;

    const parsedNumber = Number.parseInt(numberInput, 10);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 0 || parsedNumber > 9999) {
      return;
    }

    setIsNumberBusy(true);
    try {
      const state = await submitRoundNumber(visitorId, parsedNumber);
      setArena(state);
      setNumberInput("");
    } catch {
      setNumberInput("");
    } finally {
      setIsNumberBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <h1 className="brand-logo-title">
            <img
              alt="Normies Button"
              className="brand-logo"
              height="252"
              src="/assets/normies-button-logo.png"
              width="760"
            />
          </h1>
        </div>
      </header>

      <main className="layout">
        <section className="arena" aria-label="Current Type window">
          <div className="arena-copy">
            <div className="type-readout">
              {arena.status === "active" ? activeType ?? "None" : "Ready"}
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
                }`}
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
              <span>{activeType} window active. One press this round</span>
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
            <PixelIcon className="heading-icon" name="users" />
          </div>

          <div className="metric-row">
            <Metric
              icon={<PixelIcon name="activity" />}
              label="Presses"
              value={arena.totalPresses.toString()}
            />
          </div>

          <section className="number-panel" aria-label="Next round number">
            <form className="number-form" onSubmit={handleNumberSubmit}>
              <label htmlFor="round-number">Send In #</label>
              <div className="number-entry">
                <input
                  id="round-number"
                  inputMode="numeric"
                  max="9999"
                  min="0"
                  onChange={(event) => setNumberInput(event.target.value)}
                  placeholder="0-9999"
                  type="number"
                  value={numberInput}
                />
                <button type="submit" disabled={isNumberBusy}>
                  {isNumberBusy ? "..." : "Send"}
                </button>
              </div>
            </form>

            <div className="number-help">
              They will show when the next round starts!
            </div>
          </section>

          <div className="history-heading">
            <span className="eyebrow">Live History</span>
            <span>latest {HISTORY_VISIBLE_LIMIT}</span>
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

function formatSubmittedNumber(value: number): string {
  return value.toString().padStart(4, "0");
}

function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
