import {
  Activity,
  Play,
  RotateCcw,
  Timer,
  Trophy,
  Users
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
  visitorTag,
  type ArenaState
} from "./arenaApi";
import {
  fallbackProfiles,
  fetchTypeProfiles,
  type TypeProfile
} from "./normiesApi";

const POLL_MS = 1000;

export function App() {
  const visitorId = useMemo(() => ensureVisitorId(), []);
  const [profiles, setProfiles] = useState<TypeProfile[]>(fallbackProfiles);
  const [profileSource, setProfileSource] = useState<"live" | "fallback">(
    "fallback"
  );
  const [arena, setArena] = useState<ArenaState>(() =>
    fallbackArenaState(visitorId)
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [apiMessage, setApiMessage] = useState("Connecting");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchTypeProfiles()
      .then((nextProfiles) => {
        if (!cancelled) {
          setProfiles(nextProfiles);
          setProfileSource(
            nextProfiles.every((profile) => profile.source === "live")
              ? "live"
              : "fallback"
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles(fallbackProfiles());
          setProfileSource("fallback");
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
          setApiMessage("Multiplayer live");
        }
      } catch {
        if (!cancelled) {
          setApiMessage("Shared timer offline");
        }
      }
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
      ? getSecondsRemainingUntil(arena.expiresAt, adjustedNow)
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
  const actionLabel = buttonLabel(arena);
  const ActionIcon =
    arena.status === "active"
      ? arena.visitorPressed
        ? Trophy
        : Timer
      : arena.status === "expired"
        ? RotateCcw
        : Play;

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
      setApiMessage("Multiplayer live");
    } catch {
      setApiMessage("Shared timer offline");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">N</div>
          <div>
            <h1>Normies Type Button</h1>
            <p>Shared 5:00 experiment</p>
          </div>
        </div>
        <div className="status-strip">
          <span>{profileSource} counts</span>
          <span>{apiMessage}</span>
          <span>#{visitorTag(visitorId)}</span>
        </div>
      </header>

      <main className="layout">
        <section className="arena" aria-labelledby="arena-title">
          <div className="arena-copy">
            <span className="eyebrow" id="arena-title">
              Current window
            </span>
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
                        {"->"}
                      </span>
                    )}
                    <img
                      src={profile?.imageUrl}
                      alt={`Normie ${profile?.representativeId ?? ""}`}
                      width="48"
                      height="48"
                    />
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
                className="button-core"
                type="button"
                onClick={handleAction}
                aria-label={actionLabel}
                disabled={
                  isBusy || (arena.status === "active" && arena.visitorPressed)
                }
              >
                <ActionIcon aria-hidden="true" size={28} strokeWidth={2.2} />
                <span>{isBusy ? "Sync" : actionLabel}</span>
              </button>
            </div>
          </div>

          <div className="result-line">
            {arena.status === "idle" && <span>Start the shared timer</span>}
            {arena.status === "expired" && <span>The shared timer hit zero</span>}
            {arena.status === "active" && !arena.visitorPressed && activeType && (
              <span>{activeType} window active</span>
            )}
            {arena.status === "active" && arena.visitorPressed && ownType && (
              <span>You pressed as {ownType}</span>
            )}
          </div>
        </section>

        <section className="scoreboard" aria-label="Shared standings">
          <div className="score-heading">
            <div>
              <span className="eyebrow">Shared</span>
              <h2>Round {arena.roundId}</h2>
            </div>
            <Users aria-hidden="true" size={24} />
          </div>

          <div className="metric-row">
            <Metric
              icon={<Activity aria-hidden="true" size={18} />}
              label="Presses"
              value={arena.totalPresses.toString()}
            />
            <Metric
              icon={<Timer aria-hidden="true" size={18} />}
              label="Last"
              value={
                arena.lastPress
                  ? `${arena.lastPress.type} ${formatClock(
                      arena.lastPress.secondsWaited
                    )}`
                  : "--"
              }
            />
            <Metric
              icon={<Trophy aria-hidden="true" size={18} />}
              label="You"
              value={ownType ?? "--"}
            />
          </div>

          <div className="recent-list">
            {arena.lastPress && (
              <div className="recent-run">
                <span className="run-dot" />
                <strong>{arena.lastPress.type}</strong>
                <span>{formatClock(arena.lastPress.secondsWaited)}</span>
                <span>#{arena.lastPress.visitorTag}</span>
              </div>
            )}
            {!arena.lastPress && <div className="empty-state">No presses</div>}
          </div>
        </section>

      </main>
    </div>
  );
}

function buttonLabel(arena: ArenaState): string {
  if (arena.status === "active" && arena.visitorPressed) return "Pressed";
  if (arena.status === "active") return "Press";
  if (arena.status === "expired") return "Revive";
  return "Start";
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
