# Normies Type Button

**A global one-minute button game for the Normies Hackathon.**

[Play the live demo](https://normies-type-button.pages.dev) · [Normies API](https://api.normies.art) · [Cloudflare Worker API](https://normies-type-button-api.deviantclaw.workers.dev/state)

![Normies Type Button gameplay screenshot](type-button/docs/screenshots/normies-type-button.png)

Normies Type Button turns the collection's five core Types into a shared timing arena. Everyone sees the same live round. Press early and you land in the Human window; wait longer and the round moves through Cat, Alien, Agent, then Zombie. The longer you hold out, the stranger and riskier the result gets.

The hackathon prompt is simple: use the Normies API and build the best tool, game, or app around it. This entry focuses on immediate playability, visible use of Normies Type data, and a deployed multiplayer-ish loop that a judge can understand within seconds.

## Why It Fits The Normies Hackathon

- Uses live Normies collection data from `api.normies.art` to show Type distribution and representative Normie imagery.
- Makes Type traits the actual game mechanic, not decorative metadata.
- Runs as a deployed web app with a Cloudflare Worker Durable Object coordinating the global round state.
- Keeps the experience walletless and low-friction for judges: open the URL, press the button, understand the loop.
- Has a distinctive monochrome pixel-art interface built around Normies-style button, glyph, and HUD assets.

## Gameplay

Each round lasts 60 seconds:

| Time left | Awarded Type |
| --- | --- |
| `1:00-0:49` | Human |
| `0:48-0:37` | Cat |
| `0:36-0:25` | Alien |
| `0:24-0:13` | Agent |
| `0:12-0:01` | Zombie |

Players can press once per round. The app shows the current Type window, per-Type press counts, recent global history, and a small "send in #" feature for surfacing token IDs in the next round.

## Technical Notes

- React 19 + TypeScript + Vite frontend.
- Cloudflare Pages deployment for the game UI.
- Cloudflare Worker + Durable Object backend for shared round state, press history, visitor lockout, and token-number handoff.
- Normies API integration for rarity/type counts and representative token images.
- Vitest coverage for game timing logic, summaries, API fallback behavior, and data normalization.

## Run Locally

```bash
cd type-button
npm install
npm run dev
```

## Verify

```bash
cd type-button
npm test
npm run build
```

## Deploy

```bash
cd type-button
npm run deploy
```

This deploys the Worker API first, then the Cloudflare Pages frontend.

