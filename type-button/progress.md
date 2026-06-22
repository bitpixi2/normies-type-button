Original prompt: Build and iterate the Normies Type Button web game, now global-only, monochrome, multiplayer, with The Button-inspired stacked UI and Type flair buckets.

## Notes
- The local history panel was removed; the app is global-only apart from anonymous visitor identity for one-press-per-round.
- Generated a monochrome sprite-sheet reference with the built-in image generation tool and saved it at `assets/reference/imagegen-type-button-sprites-source.png`.
- Implemented crisp in-app sprites as SVG rect art in `src/pixelSprites.tsx` so the UI remains sharp at every viewport.
- Verified desktop and mobile renderings with Playwright; the UI has no Local section, no horizontal mobile overflow, and no console errors.

## TODO
- None currently known.
