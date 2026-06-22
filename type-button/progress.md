Original prompt: Build and iterate the Normies Type Button web game, now global-only, monochrome, multiplayer, with The Button-inspired stacked UI and Type flair buckets.

## Notes
- The local history panel was removed; the app is global-only apart from anonymous visitor identity for one-press-per-round.
- Generated a monochrome sprite-sheet reference with the built-in image generation tool and saved it at `assets/reference/imagegen-type-button-sprites-source.png`.
- Implemented crisp in-app sprites as SVG rect art in `src/pixelSprites.tsx` so the UI remains sharp at every viewport.
- Verified desktop and mobile renderings with Playwright; the UI has no Local section, no horizontal mobile overflow, and no console errors.
- Changed the shared round length from 5:00 to 1:00 with compressed Type windows: Human 1:00-0:49, Cat 0:48-0:37, Alien 0:36-0:25, Agent 0:24-0:13, Zombie 0:12-0:01.
- Worker zero-time behavior now advances to the next global round instead of ending on an expired game state.
- Added a global live history feed backed by Durable Object storage. It keeps recent presses across round rollovers and shows Type, waited time, remaining time, round, and visitor tag.

## TODO
- None currently known.
