import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode
} from "react";
import {
  FINAL_ROUND_ID,
  ROUND_SECONDS,
  TYPE_WINDOWS,
  formatClock,
  getSecondsRemainingUntil,
  getTypeForSecondsRemaining
} from "./game";
import {
  ARENA_API_BASE,
  fallbackArenaState,
  fetchArenaState,
  pressArena,
  startArena,
  ensureVisitorId,
  submitRoundNumber,
  type ArenaPress,
  type ArenaFinale,
  type ArenaState,
  type ArenaTypeImage
} from "./arenaApi";
import {
  PixelArrow
} from "./pixelSprites";

const POLL_MS = 1000;
const HISTORY_VISIBLE_LIMIT = 3;
const MOBILE_HISTORY_VISIBLE_LIMIT = 3;
const HISTORY_FLASH_MS = 900;
const TYPE_IMAGE_FLASH_MS = 1100;
const BUTTON_TAP_FEEDBACK_MS = 180;
const HAPTIC_STRONG_PATTERN = [35, 24, 35];
const HAPTIC_SOFT_TAP_MS = 6;
const AUDIO_STORAGE_KEY = "normies-button:audio-enabled";
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
  const [arena, setArena] = useState<ArenaState>(() =>
    fallbackArenaState(visitorId)
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [isBusy, setIsBusy] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [numberError, setNumberError] = useState("");
  const [isNumberBusy, setIsNumberBusy] = useState(false);
  const [flashedPressKey, setFlashedPressKey] = useState<string | null>(null);
  const [flashedType, setFlashedType] = useState<string | null>(null);
  const [isButtonTapping, setIsButtonTapping] = useState(false);
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(readAudioPreference);
  const flashTimeoutRef = useRef<number | null>(null);
  const typeFlashTimeoutRef = useRef<number | null>(null);
  const typeImageKeysRef = useRef<Record<string, string> | null>(null);
  const typeImagesHydratedRef = useRef(false);
  const tapTimeoutRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const buttonSoundVariantRef = useRef(0);

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

  useEffect(() => {
    const nextKeys = typeImageKeys(arena.typeImages);
    const previousKeys = typeImageKeysRef.current;
    typeImageKeysRef.current = nextKeys;

    if (!previousKeys) return undefined;
    if (isFallbackHydrationState(arena)) return undefined;
    if (!typeImagesHydratedRef.current) {
      typeImagesHydratedRef.current = true;
      return undefined;
    }

    const changedType = TYPE_WINDOWS.find(
      ({ type }) => previousKeys[type] && previousKeys[type] !== nextKeys[type]
    )?.type;
    if (!changedType) return undefined;

    if (typeFlashTimeoutRef.current !== null) {
      window.clearTimeout(typeFlashTimeoutRef.current);
    }

    setFlashedType(changedType);
    typeFlashTimeoutRef.current = window.setTimeout(() => {
      setFlashedType(null);
      typeFlashTimeoutRef.current = null;
    }, TYPE_IMAGE_FLASH_MS);

    return undefined;
  }, [arena.typeImages]);

  const adjustedNow = nowMs + (arena.serverNow - Date.now());
  const isFinale = arena.gameMode === "finale" || arena.status === "finale";
  const finalRoundId = arena.finalRoundId || FINAL_ROUND_ID;
  const displayedRemaining =
    isFinale
      ? 0
      : arena.status === "active" && arena.expiresAt
      ? Math.min(
          ROUND_SECONDS,
          getSecondsRemainingUntil(arena.expiresAt, adjustedNow)
        )
      : ROUND_SECONDS;
  const activeType =
    arena.status === "active" && !isFinale
      ? getTypeForSecondsRemaining(displayedRemaining)
      : null;
  const displayedType = isFinale
    ? "Finale"
    : arena.status === "active"
      ? activeType ?? "None"
      : "Ready";
  const activeTypeGlyph = activeType ? typeGlyphSrc(activeType) : null;
  const progress =
    isFinale
      ? 100
      : arena.status === "active"
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

  useEffect(() => {
    const renderGameToText = () =>
      JSON.stringify({
        surface: "HTML UI, origin at top-left, x right, y down",
        gameMode: arena.gameMode,
        status: arena.status,
        roundId: arena.roundId,
        finalRoundId,
        finale: arena.finale,
        currentType: activeType,
        displayedRemaining,
        totalPresses: arena.totalPresses,
        visitorPressed: arena.visitorPressed,
        visitorType: ownType,
        lastPress: arena.lastPress,
        recentPresses,
        featuredNumber: arena.featuredNumber,
        pendingNumber: arena.pendingNumber,
        typeImages: arena.typeImages,
        stats: arena.stats
      });

    window.render_game_to_text = renderGameToText;
    return () => {
      if (window.render_game_to_text === renderGameToText) {
        delete window.render_game_to_text;
      }
    };
  }, [activeType, arena, displayedRemaining, finalRoundId, ownType, recentPresses]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (typeFlashTimeoutRef.current !== null) {
        window.clearTimeout(typeFlashTimeoutRef.current);
      }
      if (tapTimeoutRef.current !== null) {
        window.clearTimeout(tapTimeoutRef.current);
      }
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
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
    if (isBusy || isFinale) {
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
    triggerSoftHaptic();
    setIsIdlePaused(false);
    resetIdleTimer();
    void syncArenaState();
  };

  const triggerButtonFeedback = () => {
    triggerHaptic(HAPTIC_STRONG_PATTERN);
    const soundVariant = buttonSoundVariantRef.current;
    buttonSoundVariantRef.current = (buttonSoundVariantRef.current + 1) % 2;
    playButtonPressSound(isAudioEnabled, audioContextRef, soundVariant);

    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current);
    }

    setIsButtonTapping(true);
    tapTimeoutRef.current = window.setTimeout(() => {
      setIsButtonTapping(false);
      tapTimeoutRef.current = null;
    }, BUTTON_TAP_FEEDBACK_MS);
  };

  const handleAudioToggle = () => {
    triggerSoftHaptic();
    setIsAudioEnabled((current) => {
      const next = !current;
      writeAudioPreference(next);
      if (next) {
        playButtonPressSound(true, audioContextRef, 0);
      }
      return next;
    });
  };

  const handleNumberSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNumberBusy || isFinale) return;
    triggerSoftHaptic();

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
      playNormieSubmitSound(isAudioEnabled, audioContextRef);
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
            <p className="brand-instruction">
              Wait for your favorite type,
              <br className="brand-instruction-break" /> then press the button.
            </p>
            <div className="header-clock" aria-live="polite">
              {formatClock(displayedRemaining)}
            </div>
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
                const typeImage = arena.typeImages[window.type];
                const isActive = activeType === window.type;
                const typePressCount = arena.pressCounts[window.type] ?? 0;
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
                    <div
                      className={`normie-tile ${
                        flashedType === window.type ? "is-type-swap-new" : ""
                      }`}
                    >
                      <img
                        src={typeImage.imageUrl}
                        alt={`${window.type} Normie ${formatNormieNumber(typeImage.value)}`}
                        width="48"
                        height="48"
                      />
                    </div>
                    <strong>{window.type}</strong>
                    <span>
                      {formatClock(window.maxRemaining)}-
                      {formatClock(window.minRemaining)}
                    </span>
                    <em className="stack-count">
                      <span className="number-text">
                        {typePressCount.toLocaleString()}
                      </span>{" "}
                      <span className="stack-count-label">
                        total {pluralizePress(typePressCount)}
                      </span>
                    </em>
                  </div>
                );
              })}
            </div>

            <div className="clock-shell" aria-live="polite">
              {isFinale ? (
                <FinalePanel finale={arena.finale} finalRoundId={finalRoundId} />
              ) : (
                <>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="clock">{formatClock(displayedRemaining)}</div>
                  <button
                    className={`button-core ${
                      isBusy && arena.status === "active" ? "is-pressed" : ""
                    } ${isButtonTapping ? "is-tapping" : ""}`}
                    type="button"
                    onClick={handleAction}
                    aria-label={actionLabel}
                    disabled={isBusy}
                  >
                    <span className="generated-button-sprite" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>

        </section>

        <section
          className={`scoreboard ${isBusy ? "is-loading-history" : ""}`}
          aria-label="Shared standings"
        >
          <div className="score-heading">
            <div>
              <h2>
                Round <span className="number-text">{arena.roundId}</span> /{" "}
                <span className="number-text">{finalRoundId.toLocaleString()}</span>
              </h2>
            </div>
            <button
              aria-label={isAudioEnabled ? "Mute button sound" : "Unmute button sound"}
              aria-pressed={!isAudioEnabled}
              className="audio-toggle"
              onClick={handleAudioToggle}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                height="32"
                src={
                  isAudioEnabled
                    ? "/assets/audio-on-pixel.svg"
                    : "/assets/audio-off-pixel.svg"
                }
                width="32"
              />
            </button>
          </div>

          <section className="number-panel" aria-label="Next round number">
            <form className="number-form" onSubmit={handleNumberSubmit}>
              <label htmlFor="round-number">Send In Normie #</label>
              <div className="number-entry">
                <input
                  id="round-number"
                  autoComplete="off"
                  aria-describedby={numberError ? "round-number-error" : undefined}
                  aria-invalid={numberError ? "true" : "false"}
                  inputMode="text"
                  onFocus={triggerSoftHaptic}
                  onChange={(event) => {
                    triggerSoftHaptic();
                    setNumberInput(event.target.value);
                    if (numberError) setNumberError("");
                  }}
                  pattern="#?[0-9]*"
                  type="text"
                  value={numberInput}
                  disabled={isFinale}
                />
                <button type="submit" disabled={isNumberBusy || isFinale}>
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
              {isFinale
                ? "Finale locked. Submitted Normies are closed."
                : "They will replace their same Type in the countdown area."}
            </div>
          </section>

          <GlobalStats stats={arena.stats} />

          <div className="history-heading">
            <span className="eyebrow">Live History</span>
            <span className="history-actions">
              <span className="history-limit history-limit-wide">
                latest {HISTORY_VISIBLE_LIMIT}
              </span>
              <span className="history-limit history-limit-mobile">
                latest {MOBILE_HISTORY_VISIBLE_LIMIT}
              </span>
              <a
                className="history-more"
                href={`${ARENA_API_BASE}/state`}
                rel="noreferrer"
                target="_blank"
              >
                View all data
              </a>
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
                <img
                  alt=""
                  aria-hidden="true"
                  className="history-type-glyph"
                  height="32"
                  src={typeGlyphSrc(press.type)}
                  width="32"
                />
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
        <span className="footer-section">
          Made by{" "}
          <a
            href="https://bitpixi.com"
            onPointerDown={triggerSoftHaptic}
            rel="noreferrer"
            target="_blank"
          >
            bitpixi
          </a>
          <FooterTypeGlyph type="Human" />
          Normie{" "}
          <a
            href="https://opensea.io/item/ethereum/0x9eb6e2025b64f340691e424b7fe7022ffde12438/2613"
            onPointerDown={triggerSoftHaptic}
            rel="noreferrer"
            target="_blank"
          >
            #2613
          </a>
        </span>
        <FooterTypeGlyph type="Cat" />
        <button
          className="footer-section"
          type="button"
          onClick={() => {
            triggerSoftHaptic();
            setInfoModal("terms");
          }}
        >
          Terms
        </button>
        <FooterTypeGlyph type="Alien" />
        <button
          className="footer-section"
          type="button"
          onClick={() => {
            triggerSoftHaptic();
            setInfoModal("privacy");
          }}
        >
          Privacy
        </button>
        <FooterTypeGlyph type="Agent" />
        <a
          className="footer-section"
          href="https://github.com/bitpixi2/normies-button"
          onPointerDown={triggerSoftHaptic}
          rel="noreferrer"
          target="_blank"
        >
          Github Repo
        </a>
        <FooterTypeGlyph type="Zombie" />
        <a
          className="footer-section"
          href="https://x.com/bitpixi"
          onPointerDown={triggerSoftHaptic}
          rel="noreferrer"
          target="_blank"
        >
          Follow me on X
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

function FooterTypeGlyph({ type }: { type: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="footer-type-glyph"
      height="18"
      src={typeGlyphSrc(type)}
      width="18"
    />
  );
}

function FinalePanel({
  finale,
  finalRoundId
}: {
  finale: ArenaFinale | null;
  finalRoundId: number;
}) {
  const winners = finale?.winners ?? [];

  return (
    <section className="finale-panel" aria-label="Ultimate winner">
      <span className="eyebrow">Ultimate Winner</span>
      <div className="finale-winners">
        {winners.length > 0 ? (
          winners.map((type) => (
            <img
              alt=""
              aria-hidden="true"
              className="finale-type-glyph"
              height="56"
              key={type}
              src={typeGlyphSrc(type)}
              width="56"
            />
          ))
        ) : (
          <span className="finale-empty-glyph" aria-hidden="true">
            --
          </span>
        )}
      </div>
      <strong>
        {winners.length > 0 ? formatTypeList(winners) : "No Type"}
      </strong>
      <p>{formatUltimateWinnerCopy(finale)}</p>
      <span className="finale-round">
        Round <span className="number-text">{finalRoundId.toLocaleString()}</span>{" "}
        complete
      </span>
    </section>
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
          <button
            type="button"
            onClick={() => {
              triggerSoftHaptic();
              onClose();
            }}
            aria-label="Close"
          >
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
        owner wallet, Type, replacement image data, the round, timestamp, and
        visitor tag. The owner wallet comes from the Normies API at submission
        time and does not necessarily mean the wallet owner is the person who
        entered the Normie ID. The app does not ask for your name, email, or
        wallet.
      </p>
    </div>
  );
}

function buttonLabel(arena: ArenaState): string {
  if (arena.status === "finale") return "Finale";
  if (arena.status === "active") return "Press";
  if (arena.status === "expired") return "Revive";
  return "Start";
}

function readAudioPreference() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AUDIO_STORAGE_KEY) !== "off";
}

function writeAudioPreference(isEnabled: boolean) {
  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, isEnabled ? "on" : "off");
  } catch {}
}

function playButtonPressSound(
  isEnabled: boolean,
  audioContextRef: MutableRefObject<AudioContext | null>,
  variant: number
) {
  const context = getAudioContext(isEnabled, audioContextRef);
  if (!context) return;

  const startedAt = context.currentTime;
  const clickOscillator = context.createOscillator();
  const bodyOscillator = context.createOscillator();
  const clickGain = context.createGain();
  const bodyGain = context.createGain();
  const masterGain = context.createGain();

  const isAlternate = variant % 2 === 1;
  clickOscillator.type = isAlternate ? "sawtooth" : "square";
  clickOscillator.frequency.setValueAtTime(isAlternate ? 690 : 820, startedAt);
  clickOscillator.frequency.exponentialRampToValueAtTime(
    isAlternate ? 260 : 220,
    startedAt + 0.035
  );
  clickGain.gain.setValueAtTime(0.001, startedAt);
  clickGain.gain.exponentialRampToValueAtTime(
    isAlternate ? 0.085 : 0.11,
    startedAt + 0.004
  );
  clickGain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.055);

  bodyOscillator.type = isAlternate ? "sine" : "triangle";
  bodyOscillator.frequency.setValueAtTime(isAlternate ? 118 : 145, startedAt);
  bodyOscillator.frequency.exponentialRampToValueAtTime(
    isAlternate ? 84 : 72,
    startedAt + 0.09
  );
  bodyGain.gain.setValueAtTime(0.001, startedAt);
  bodyGain.gain.exponentialRampToValueAtTime(
    isAlternate ? 0.14 : 0.18,
    startedAt + 0.008
  );
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.12);

  masterGain.gain.setValueAtTime(0.2, startedAt);
  masterGain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.13);

  clickOscillator.connect(clickGain).connect(masterGain);
  bodyOscillator.connect(bodyGain).connect(masterGain);
  masterGain.connect(context.destination);

  clickOscillator.start(startedAt);
  bodyOscillator.start(startedAt);
  clickOscillator.stop(startedAt + 0.06);
  bodyOscillator.stop(startedAt + 0.13);
}

function playNormieSubmitSound(
  isEnabled: boolean,
  audioContextRef: MutableRefObject<AudioContext | null>
) {
  const context = getAudioContext(isEnabled, audioContextRef);
  if (!context) return;

  const startedAt = context.currentTime;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.18, startedAt);
  masterGain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.34);
  masterGain.connect(context.destination);

  [880, 1174.66, 1567.98, 2093].forEach((frequency, index) => {
    const noteStart = startedAt + index * 0.045;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = index % 2 === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 1.08,
      noteStart + 0.07
    );

    gain.gain.setValueAtTime(0.001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.09, noteStart + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.14);

    oscillator.connect(gain).connect(masterGain);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.16);
  });
}

function getAudioContext(
  isEnabled: boolean,
  audioContextRef: MutableRefObject<AudioContext | null>
) {
  if (!isEnabled || typeof window === "undefined") return null;

  const AudioContextConstructor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return null;

  const context =
    audioContextRef.current ??
    new AudioContextConstructor({ latencyHint: "interactive" });
  audioContextRef.current = context;
  return context;
}

function historyPressKey(press: ArenaPress): string {
  return `${press.roundId}-${press.timestamp}-${press.visitorTag}`;
}

function typeGlyphSrc(type: string): string {
  return `/assets/type-${type.toLowerCase()}-glyph.png`;
}

function triggerSoftHaptic() {
  triggerHaptic(HAPTIC_SOFT_TAP_MS);
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  navigator.vibrate(pattern);
}

function formatNormieNumber(value: number): string {
  return `#${value}`;
}

function typeImageKeys(
  images: Record<string, ArenaTypeImage>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(images).map(([type, image]) => [
      type,
      `${image.value}:${image.timestamp}:${image.imageUrl}`
    ])
  );
}

function isFallbackHydrationState(arena: ArenaState): boolean {
  return arena.status === "idle" && arena.roundId === 0 && arena.totalPresses === 0;
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
  const leadingCopy = formatGlobalLeadCopy(stats);

  return (
    <section className="global-leaderboard" aria-label="Global Leaderboard">
      <h3>Global Leaderboard</h3>
      <div className="global-stats">
        <div className="stat-chip">
          <strong>{stats.totalPresses.toLocaleString()}</strong>
          <span>total {pluralizePress(stats.totalPresses)}</span>
        </div>
        <div className="stat-chip">
          <strong>{stats.countryCount.toLocaleString()}</strong>
          <span>{pluralizeCountry(stats.countryCount)}</span>
        </div>
        <div className="stat-chip stat-chip-wide">
          {renderGlobalLeadCopy(stats, leadingCopy)}
        </div>
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

export function formatGlobalLeadCopy(stats: ArenaState["stats"]): string {
  const rankedTypes = TYPE_WINDOWS.map(({ type }) => ({
    type,
    presses: stats.typeCounts[type] ?? 0
  })).sort((a, b) => b.presses - a.presses);
  const topCount = rankedTypes[0]?.presses ?? 0;

  if (topCount <= 0) {
    return "No Type leading yet";
  }

  const tiedTypes = rankedTypes
    .filter((entry) => entry.presses === topCount)
    .map((entry) => entry.type);

  if (tiedTypes.length > 1) {
    return `${formatTypeList(tiedTypes)} are tied at ${topCount} total ${pluralizePress(topCount)}`;
  }

  return `${pluralizeType(tiedTypes[0])} leading by ${stats.leadMargin} total ${pluralizePress(stats.leadMargin)}`;
}

export function formatUltimateWinnerCopy(finale: ArenaFinale | null): string {
  if (!finale || finale.winningCount <= 0 || finale.winners.length === 0) {
    return "No Type won. The button outlasted everyone.";
  }

  if (finale.isTie) {
    return `${formatTypeList(finale.winners)} share the win at ${finale.winningCount.toLocaleString()} ${pluralizePress(finale.winningCount)}`;
  }

  return `${pluralizeType(finale.winners[0])} win with ${finale.winningCount.toLocaleString()} ${pluralizePress(finale.winningCount)}`;
}

function renderGlobalLeadCopy(
  stats: ArenaState["stats"],
  fallbackCopy: string
): ReactNode {
  const rankedTypes = TYPE_WINDOWS.map(({ type }) => ({
    type,
    presses: stats.typeCounts[type] ?? 0
  })).sort((a, b) => b.presses - a.presses);
  const topCount = rankedTypes[0]?.presses ?? 0;

  if (topCount <= 0) {
    return fallbackCopy;
  }

  const tiedTypes = rankedTypes
    .filter((entry) => entry.presses === topCount)
    .map((entry) => entry.type);

  if (tiedTypes.length > 1) {
    return (
      <>
        <LeadTypeGlyphs types={tiedTypes} />
        <span>
          {formatTypeList(tiedTypes)} are tied at{" "}
          <span className="number-text">{topCount}</span>{" "}
          total {pluralizePress(topCount)}
        </span>
      </>
    );
  }

  return (
    <>
      <LeadTypeGlyphs types={tiedTypes} />
      <span>
        {pluralizeType(tiedTypes[0])} leading by{" "}
        <span className="number-text">{stats.leadMargin}</span>{" "}
        total {pluralizePress(stats.leadMargin)}
      </span>
    </>
  );
}

function LeadTypeGlyphs({ types }: { types: string[] }) {
  return (
    <span className="lead-type-glyphs" aria-hidden="true">
      {types.map((type) => (
        <img
          alt=""
          className="lead-type-glyph"
          height="24"
          key={type}
          src={typeGlyphSrc(type)}
          width="24"
        />
      ))}
    </span>
  );
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

function formatTypeList(types: string[]): string {
  const pluralTypes = types.map(pluralizeType);

  if (pluralTypes.length === 1) {
    return pluralTypes[0];
  }

  if (pluralTypes.length === 2) {
    return `${pluralTypes[0]} and ${pluralTypes[1]}`;
  }

  return `${pluralTypes.slice(0, -1).join(", ")}, and ${pluralTypes.at(-1)}`;
}
