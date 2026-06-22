import {
  Activity,
  History,
  Play,
  RotateCcw,
  Timer,
  Trophy
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROUND_SECONDS,
  TYPE_WINDOWS,
  canPressRound,
  createFailedRun,
  createPressRun,
  formatClock,
  getSecondsRemaining,
  getTypeForSecondsRemaining,
  getTypeWindow,
  summarizeHistory,
  type NormieType,
  type RunRecord
} from "./game";
import {
  fallbackProfiles,
  fetchTypeProfiles,
  type TypeProfile
} from "./normiesApi";
import { clearRunHistory, loadRunHistory, prependRunRecord } from "./storage";

type RoundStatus = "idle" | "running" | "pressed" | "failed";

export function App() {
  const [profiles, setProfiles] = useState<TypeProfile[]>(fallbackProfiles);
  const [profileSource, setProfileSource] = useState<"live" | "fallback">(
    "fallback"
  );
  const [status, setStatus] = useState<RoundStatus>("idle");
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<RunRecord | null>(null);
  const [history, setHistory] = useState<RunRecord[]>(() => loadRunHistory());
  const historyRef = useRef(history);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

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
    if (status !== "running" || startedAtMs === null) {
      return;
    }

    const tick = () => {
      const nextRemaining = getSecondsRemaining(startedAtMs, Date.now());
      setSecondsRemaining(nextRemaining);

      if (nextRemaining === 0) {
        const failedRun = createFailedRun();
        const nextHistory = prependRunRecord(failedRun, historyRef.current);
        setHistory(nextHistory);
        setResult(failedRun);
        setStatus("failed");
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [startedAtMs, status]);

  const activeType = getTypeForSecondsRemaining(secondsRemaining);
  const visibleType = result?.awardedType ?? activeType ?? "Human";
  const visibleWindow = getTypeWindow(visibleType as NormieType);
  const summary = useMemo(() => summarizeHistory(history), [history]);
  const progress = ((ROUND_SECONDS - secondsRemaining) / ROUND_SECONDS) * 100;

  const startRound = () => {
    const now = Date.now();
    setStartedAtMs(now);
    setSecondsRemaining(ROUND_SECONDS);
    setResult(null);
    setStatus("running");
  };

  const pressButton = () => {
    if (!canPressRound(status, secondsRemaining) || startedAtMs === null) {
      return;
    }

    const remaining = getSecondsRemaining(startedAtMs, Date.now());
    if (!canPressRound(status, remaining)) {
      return;
    }

    const run = createPressRun(remaining);
    const nextHistory = prependRunRecord(run, history);
    setSecondsRemaining(remaining);
    setResult(run);
    setHistory(nextHistory);
    setStatus(run.status === "success" ? "pressed" : "failed");
  };

  const resetHistory = () => {
    clearRunHistory();
    setHistory([]);
  };

  const buttonAction = () => {
    if (status === "running") {
      pressButton();
      return;
    }

    startRound();
  };

  const actionLabel =
    status === "idle" ? "Start" : status === "running" ? "Press" : "New run";
  const ActionIcon =
    status === "idle" ? Play : status === "running" ? Timer : RotateCcw;

  return (
    <div
      className="app"
      style={
        {
          "--active-color": visibleWindow.color,
          "--active-accent": visibleWindow.accent,
          "--active-tone": visibleWindow.tone
        } as CSSProperties
      }
    >
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">N</div>
          <div>
            <h1>Normies Type Button</h1>
            <p>5:00 solo round</p>
          </div>
        </div>
        <div className="source-pill">{profileSource} counts</div>
      </header>

      <main className="layout">
        <section className="arena" aria-labelledby="arena-title">
          <div className="arena-copy">
            <span className="eyebrow" id="arena-title">
              Current Type
            </span>
            <div className="type-readout">
              {status === "failed" ? "No Type" : visibleType}
            </div>
          </div>

          <div className="clock-shell" aria-live="polite">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="clock">{formatClock(secondsRemaining)}</div>
            <button
              className="button-core"
              type="button"
              onClick={buttonAction}
              aria-label={actionLabel}
            >
              <ActionIcon aria-hidden="true" size={28} strokeWidth={2.2} />
              <span>{actionLabel}</span>
            </button>
          </div>

          <div className="result-line">
            {status === "idle" && <span>Ready</span>}
            {status === "running" && activeType && (
              <span>{activeType} window active</span>
            )}
            {status === "pressed" && result?.awardedType && (
              <span>
                Awarded {result.awardedType} at{" "}
                {formatClock(result.pressedAtSecondsRemaining)}
              </span>
            )}
            {status === "failed" && <span>Zero reached</span>}
          </div>
        </section>

        <section className="type-grid" aria-label="Type windows">
          {TYPE_WINDOWS.map((window) => {
            const profile = profiles.find((entry) => entry.type === window.type);
            const isActive = activeType === window.type && status === "running";
            const standing = summary.standings.find(
              (entry) => entry.type === window.type
            );

            return (
              <article
                className={`type-card ${isActive ? "is-active" : ""}`}
                key={window.type}
                style={
                  {
                    "--type-color": window.color,
                    "--type-accent": window.accent,
                    "--type-tone": window.tone
                  } as CSSProperties
                }
              >
                <img
                  src={profile?.imageUrl}
                  alt={`Normie ${profile?.representativeId ?? ""}`}
                  width="80"
                  height="80"
                  loading="lazy"
                />
                <div className="type-card-body">
                  <div className="type-card-main">
                    <strong>{window.type}</strong>
                    <span>{profile?.count.toLocaleString() ?? "0"}</span>
                  </div>
                  <div className="window-range">
                    {formatClock(window.maxRemaining)}-
                    {formatClock(window.minRemaining)}
                  </div>
                  <div className="card-stat">
                    {standing?.bestSecondsWaited !== null &&
                    standing?.bestSecondsWaited !== undefined
                      ? formatClock(standing.bestSecondsWaited)
                      : "--"}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="scoreboard" aria-label="Local standings">
          <div className="score-heading">
            <div>
              <span className="eyebrow">Local</span>
              <h2>Standings</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={resetHistory}
              aria-label="Clear history"
              disabled={history.length === 0}
            >
              <RotateCcw aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="metric-row">
            <Metric
              icon={<Trophy aria-hidden="true" size={18} />}
              label="Best"
              value={
                summary.bestRun?.awardedType
                  ? `${summary.bestRun.awardedType} ${formatClock(
                      summary.bestRun.secondsWaited
                    )}`
                  : "--"
              }
            />
            <Metric
              icon={<Activity aria-hidden="true" size={18} />}
              label="Runs"
              value={summary.totalRuns.toString()}
            />
            <Metric
              icon={<History aria-hidden="true" size={18} />}
              label="Failed"
              value={summary.failedRuns.toString()}
            />
          </div>

          <div className="recent-list">
            {history.slice(0, 6).map((run) => (
              <div className="recent-run" key={run.id}>
                <span className={`run-dot ${run.awardedType ?? "failed"}`} />
                <strong>{run.awardedType ?? "No Type"}</strong>
                <span>{formatClock(run.secondsWaited)}</span>
                <span>{formatDate(run.timestamp)}</span>
              </div>
            ))}
            {history.length === 0 && <div className="empty-state">No runs</div>}
          </div>
        </section>
      </main>
    </div>
  );
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

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
