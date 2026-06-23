Original prompt: Build and iterate the Normies Type Button web game, now global-only, monochrome, multiplayer, with The Button-inspired stacked UI and Type flair buckets.

## Notes
- The local history panel was removed; the app is global-only apart from anonymous visitor identity for one-press-per-round.
- Generated a monochrome sprite-sheet reference with the built-in image generation tool and saved it at `assets/reference/imagegen-type-button-sprites-source.png`.
- Implemented crisp in-app sprites as SVG rect art in `src/pixelSprites.tsx` so the UI remains sharp at every viewport.
- Verified desktop and mobile renderings with Playwright; the UI has no Local section, no horizontal mobile overflow, and no console errors.
- Changed the shared round length from 5:00 to 1:00 with compressed Type windows: Human 1:00-0:49, Cat 0:48-0:37, Alien 0:36-0:25, Agent 0:24-0:13, Zombie 0:12-0:01.
- Worker zero-time behavior now advances to the next global round instead of ending on an expired game state.
- Added a global live history feed backed by Durable Object storage. It keeps recent presses across round rollovers and shows Type, waited time, remaining time, round, and visitor tag.
- Clarified the one-press-per-round lockout in the result line and disabled button label so pressed players know they must wait for the next round.
- Lightened the pixel font weight to improve `5` and `C` readability, capped the visible history feed at the latest 5 rows, and added a right-panel flash while syncing plus a row flash when a new history entry lands.
- Added a shared next-round number queue in the right panel. Submitted numbers show on the following round, with current and pending number state stored in the Worker.
- Swapped the main button to generated raster button crops and added a custom pixel cursor asset.
- Cleaned up the generated button presentation: no visible Press/icon label, Wait only on locked rounds, full transparent button crops without the ellipse mask, and shorter next-round number helper copy.
- Trimmed the right panel to save vertical room: removed the Last/You metric cards and removed the current-round number display above the Send In # form.
- Removed the upper-right header status pills and lowered the locked Wait label slightly within the pressed button's dark circle.
- Recentered the pressed button raster by measuring dark-pixel bounds; default and pressed sprites now share the same dark-pixel horizontal center.
- Simplified the header to "Normies Button" and removed the extra brand icon/subtitle. Removed Type glyph overlays from Normies API image tiles.
- Removed the visible "Current window" and "Shared" micro-labels to reduce text clutter.

## TODO
- None currently known.
