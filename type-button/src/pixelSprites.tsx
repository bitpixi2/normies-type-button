import type { ReactNode } from "react";
import type { NormieType } from "./game";

type SpriteProps = {
  className?: string;
};

type PixelIconName =
  | "activity"
  | "button"
  | "play"
  | "revive"
  | "timer"
  | "trophy"
  | "users";

export function PixelArrow({ className }: SpriteProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 24"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect x="2" y="8" width="18" height="8" fill="currentColor" />
      <rect x="18" y="4" width="4" height="16" fill="currentColor" />
      <rect x="22" y="6" width="4" height="12" fill="currentColor" />
      <rect x="26" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  );
}

export function StackedButtonSprite({
  className,
  pressed
}: SpriteProps & { pressed: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 96"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <g className={pressed ? "sprite-pressed" : undefined}>
        <g className="button-sprite-shadow">
          <rect x="24" y="84" width="48" height="5" />
          <rect x="18" y="79" width="60" height="5" />
          <rect x="14" y="74" width="68" height="5" />
        </g>
        <PixelBand y={74} />
        <PixelBand y={64} />
        <PixelBand y={54} />
        <PixelTopDisc />
      </g>
    </svg>
  );
}

export function TypeGlyph({ className, type }: SpriteProps & { type: NormieType }) {
  const paths: Record<NormieType, ReactNode> = {
    Human: (
      <>
        <rect x="11" y="6" width="10" height="4" />
        <rect x="8" y="10" width="16" height="10" />
        <rect x="10" y="20" width="12" height="4" />
        <rect x="6" y="25" width="20" height="3" />
      </>
    ),
    Cat: (
      <>
        <rect x="7" y="7" width="5" height="5" />
        <rect x="20" y="7" width="5" height="5" />
        <rect x="8" y="11" width="16" height="12" />
        <rect x="11" y="23" width="10" height="3" />
        <rect x="4" y="16" width="5" height="2" />
        <rect x="23" y="16" width="5" height="2" />
      </>
    ),
    Alien: (
      <>
        <rect x="14" y="4" width="4" height="4" />
        <rect x="9" y="8" width="14" height="4" />
        <rect x="6" y="12" width="20" height="8" />
        <rect x="9" y="20" width="14" height="4" />
        <rect x="12" y="24" width="8" height="3" />
      </>
    ),
    Agent: (
      <>
        <rect x="8" y="7" width="16" height="3" />
        <rect x="5" y="10" width="22" height="3" />
        <rect x="9" y="13" width="14" height="10" />
        <rect x="7" y="16" width="6" height="3" />
        <rect x="19" y="16" width="6" height="3" />
        <rect x="13" y="19" width="6" height="2" />
        <rect x="6" y="25" width="20" height="3" />
      </>
    ),
    Zombie: (
      <>
        <rect x="10" y="6" width="12" height="3" />
        <rect x="7" y="9" width="18" height="13" />
        <rect x="10" y="22" width="4" height="4" />
        <rect x="18" y="22" width="4" height="4" />
        <rect x="13" y="26" width="6" height="3" />
        <rect x="5" y="13" width="4" height="4" />
        <rect x="23" y="13" width="4" height="4" />
      </>
    )
  };

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {paths[type]}
    </svg>
  );
}

export function PixelIcon({
  className,
  name
}: SpriteProps & { name: PixelIconName }) {
  const paths: Record<PixelIconName, ReactNode> = {
    activity: (
      <>
        <rect x="3" y="15" width="5" height="4" />
        <rect x="8" y="11" width="4" height="4" />
        <rect x="12" y="7" width="4" height="4" />
        <rect x="16" y="11" width="4" height="4" />
        <rect x="20" y="5" width="4" height="4" />
        <rect x="24" y="9" width="5" height="4" />
      </>
    ),
    button: (
      <>
        <rect x="10" y="8" width="12" height="3" />
        <rect x="7" y="11" width="18" height="5" />
        <rect x="5" y="16" width="22" height="5" />
        <rect x="8" y="21" width="16" height="3" />
        <rect x="11" y="24" width="10" height="3" />
      </>
    ),
    play: (
      <>
        <rect x="9" y="7" width="5" height="18" />
        <rect x="14" y="10" width="5" height="12" />
        <rect x="19" y="13" width="5" height="6" />
      </>
    ),
    revive: (
      <>
        <rect x="8" y="6" width="14" height="4" />
        <rect x="6" y="10" width="4" height="6" />
        <rect x="22" y="10" width="4" height="10" />
        <rect x="18" y="18" width="8" height="4" />
        <rect x="14" y="22" width="4" height="4" />
        <rect x="10" y="18" width="4" height="4" />
      </>
    ),
    timer: (
      <>
        <rect x="12" y="3" width="8" height="4" />
        <rect x="9" y="7" width="14" height="4" />
        <rect x="6" y="11" width="20" height="14" />
        <rect x="10" y="25" width="12" height="4" />
        <rect x="15" y="13" width="3" height="8" />
        <rect x="18" y="18" width="5" height="3" />
      </>
    ),
    trophy: (
      <>
        <rect x="9" y="5" width="14" height="4" />
        <rect x="7" y="9" width="18" height="8" />
        <rect x="5" y="9" width="4" height="6" />
        <rect x="23" y="9" width="4" height="6" />
        <rect x="12" y="17" width="8" height="5" />
        <rect x="10" y="22" width="12" height="3" />
        <rect x="7" y="25" width="18" height="3" />
      </>
    ),
    users: (
      <>
        <rect x="7" y="7" width="7" height="7" />
        <rect x="18" y="8" width="6" height="6" />
        <rect x="5" y="17" width="11" height="8" />
        <rect x="17" y="18" width="10" height="7" />
      </>
    )
  };

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {paths[name]}
    </svg>
  );
}

function PixelTopDisc() {
  return (
    <g className="button-sprite-top">
      <rect x="32" y="10" width="32" height="4" />
      <rect x="24" y="14" width="48" height="4" />
      <rect x="18" y="18" width="60" height="6" />
      <rect x="14" y="24" width="68" height="10" />
      <rect x="12" y="34" width="72" height="14" />
      <rect x="16" y="48" width="64" height="6" />
      <rect x="24" y="54" width="48" height="4" />
      <rect x="32" y="58" width="32" height="4" />

      <rect x="28" y="18" width="40" height="4" className="button-sprite-cut" />
      <rect x="22" y="22" width="52" height="8" className="button-sprite-cut" />
      <rect x="18" y="30" width="60" height="8" className="button-sprite-cut" />
      <rect x="22" y="38" width="52" height="6" className="button-sprite-cut" />
      <rect x="30" y="44" width="36" height="4" className="button-sprite-cut" />

      <rect x="28" y="24" width="40" height="4" />
      <rect x="22" y="28" width="52" height="8" />
      <rect x="20" y="36" width="56" height="8" />
      <rect x="24" y="44" width="48" height="4" />
      <rect x="32" y="48" width="32" height="4" />
    </g>
  );
}

function PixelBand({ y }: { y: number }) {
  return (
    <g className="button-sprite-layer">
      <rect x="32" y={y} width="32" height="4" />
      <rect x="24" y={y + 4} width="48" height="4" />
      <rect x="16" y={y + 8} width="64" height="5" />
      <rect x="20" y={y + 4} width="56" height="4" className="button-sprite-cut" />
      <rect x="22" y={y + 8} width="52" height="3" className="button-sprite-cut" />
    </g>
  );
}
