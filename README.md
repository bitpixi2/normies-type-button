# Normies Button

![Normies Button regret button](type-button/docs/images/button.jpeg)

```txt
+------------------------------------------------------------+
|  NORMIES BUTTON                                            |
|  one shared timer. five Type windows. one irreversible tap. |
+------------------------------------------------------------+
```

**A global one-minute button game for the Normies Hackathon.**

[Play the live demo](https://normies-type-button.pages.dev) | [Normies API](https://api.normies.art) | [Live JSON state](https://normies-type-button-api.deviantclaw.workers.dev/state)

Normies Button turns the collection's `Type` trait into a live timing ritual. Everyone sees the same global round. Wait for your favorite Type, then press the button.

```txt
          1:00 -> Human  \
          0:48 -> Cat     > the brave wait
          0:36 -> Alien  /
          0:24 -> Agent  \
          0:12 -> Zombie  > the final twelve seconds bite back
```

## What It Is

```txt
+-[ THE BUTTON ROOM ]----------------------------------------+
|  * shared 60-second global round                          |
|  * one press per visitor per round                        |
|  * instant multiplayer state from a Cloudflare Durable Obj |
|  * Normies API images and Type data wired into gameplay   |
|  * submitted Normie numbers can replace matching Type art |
+------------------------------------------------------------+
```

The hackathon idea is simple: make Normies data playable. This is not a gallery wearing a game costume; the trait itself is the clock.

## Judge Bait

```txt
> visible API usage
> fast walletless entry
> real shared backend
> readable rules in the first screen
> monochrome pixel UI with custom sprites
> Zombie pressure in the final window
```

- **Live Normies data:** pulls collection imagery and Type information from `api.normies.art`.
- **Trait-native mechanic:** `Human`, `Cat`, `Alien`, `Agent`, and `Zombie` are the countdown bands.
- **Global play:** presses, rounds, history, countries, and Type counts are coordinated server-side.
- **No wallet wall:** anyone can land, wait, regret it, and press.
- **Hackathon-friendly:** the live JSON endpoint exposes state for quick inspection.

## The Countdown

| Time left | Awarded Type | Vibe |
| --- | --- | --- |
| `1:00-0:49` | Human | the safe press |
| `0:48-0:37` | Cat | patience starts |
| `0:36-0:25` | Alien | unusual timing |
| `0:24-0:13` | Agent | classified nerves |
| `0:12-0:01` | Zombie | last-call brain fog |

If nobody presses before zero, the round rolls on. If someone presses, the next global round starts immediately.

## Zombie Notes

```txt
   [ZOMBIE WINDOW]
   wait too long and the room gets loud
   wait perfectly and the scoreboard remembers
```

- The `Zombie` window is the final twelve seconds.
- It is intentionally stressful.
- It is also where the best screenshots happen.
- Easter egg rule of thumb: if the button feels like a bad idea, the design is working.

## Multiplayer Backend

```txt
browser
  `-- Cloudflare Pages
       `-- Worker API
            `-- Durable Object: global arena state
                 |-- current round
                 |-- press log
                 |-- recent history
                 |-- Type counts
                 `-- submitted Normie replacement queue
```

The Worker keeps the room honest:

- one accepted press per visitor per round
- throttling against rapid scripted presses
- repeated-timing abuse checks
- recent press history
- private submitted-number log with owner-at-submission records

## Visual System

```txt
[#] monochrome first
[#] pixel glyphs for Type identity
[#] button-stack sprite with pressed state
[#] filigree HUD corners
[#] no landing page; the game is the first screen
```

## Tech Stack

- React 19 + TypeScript + Vite
- Cloudflare Pages frontend
- Cloudflare Worker + Durable Object backend
- Normies API integration
- Vitest coverage for timing, scoring, API fallbacks, and formatting helpers

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Deploy

```bash
npm run deploy
```

This deploys the Worker API first, then the Cloudflare Pages frontend.

```txt
+-------------------------------+
|  PRESS LOG SAYS:              |
|  "I regret it."               |
|  "Good. That means it worked." |
+-------------------------------+
```
