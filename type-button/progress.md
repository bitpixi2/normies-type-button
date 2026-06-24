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
- Corrected the generated branding to Normies-specific assets: "Normies Button" logo with a pressable stacked-button motif and a transparent HUD filigree layer using push-button and Type glyph motifs. The mistaken Dead and Breakfast assets were removed from this repo.
- Reworked the HUD filigree usage to four responsive corner-only sprite assets so the generated buttons and ornaments stay visible around the layout instead of sitting faintly under the panels.
- Moved the Normies Button logo into the arena module and changed the active Type label to a right-aligned readout in that same module header.
- Replaced the main button raster with a rounded logo-matched pixel plunger plus a compressed depressed state, regenerated sharper corner filigree from the reference sheet, moved desktop modules lower, and added active Type glyph art beside the upper-right Type readout.
- Renamed the README title to "Normies Button" and changed the mobile arena so the centered logo, Type readout, clock, and button appear before the Type stack.
- Added mobile haptic/tap feedback for valid button presses, denser mobile Type rows, and a compact latest-3 mobile history panel.
- Replaced the HUD corner filigrees with the newer corner-only sheet and vertically centered the desktop module layout within the viewport.
- Reduced all four background corner filigrees to roughly half size with matched top and bottom sizing.
- Added a five-minute inactivity pause that darkens the screen, stops arena polling, and resumes with an immediate state sync from a centered Resume module.
- Increased only the upper-left and upper-right background filigree render size so their shorter source crops visually match the lower corner sprites.
- Added a backend-only submitted token log in the Arena Durable Object SQLite storage. Each Send In # submission now records token ID, owner from the Normies owner API at submission time, visitor tag, round, and timestamp; a private `/number-log` endpoint can read recent rows when `NUMBER_LOG_KEY` is configured.
- Replaced the main button up/down raster assets with the supplied `Button2Up.png` and `Button2down.png` sprites for both desktop and mobile button states.
- Added a desktop-only pixel cursor trail and tightened the desktop HUD: removed the large header Type readout, stacked button/timer/bar, pulled the bar left, extended Type rows around the arrow, and inverted the global lead bar.
- Changed the active Type row on desktop and mobile to a full black selected background with a white moving arrow.
- Changed press handling so an accepted press immediately closes the current global round and starts the next one for everyone; the old post-press wait/cooldown UI was removed.
- Added backend abuse protection for accepted presses: a 15-second visitor/IP throttle to stop rapid Human farming, plus a repeated exact millisecond timing detector that blocks a visitor/IP after the same round-offset timing is seen 3 times.
- Removed the desktop cursor trail, removed all visible button label text, and moved the desktop timer into the arena header opposite the Normies Button logo.
- Lowered the desktop main modules and gave the footer more top spacing so the panels sit clear of the corner filigree background.
- Changed the Global Leaderboard Presses stat chip to use the same grey family as the main button with light text on desktop and mobile.
- Reduced the desktop header timer size and pinned the countdown bar to the bottom of the Type stack beside the final Type row.
- Restored the desktop timer to the button stack below the button, placed the countdown bar under the timer, and shifted that stack right for more even button-side padding.
- Changed the Country stat and Normie number field to explicit white surfaces, added grey text selection for the field, and replaced Live History square markers with Type glyph sprites.
- Updated the Send In Normie # helper copy to clarify that submitted Normies replace the matching Type image on the next turn.
- Normalized the Type glyph PNG sprites to an equal visible height with transparent padding so Live History icons no longer look clipped or uneven.
- Replaced the Type glyph PNGs again by slicing the user-supplied generated sprite sheet, preserving the sharper Human/Cat/Alien/Agent/Zombie style from that image.
- Suppressed Type image flash during initial backend hydration, including React StrictMode fallback passes, so submitted Type images no longer flash on page refresh; later real Type image replacements still flash.
- Centered the desktop Normies Button logo inside the arena module and moved the desktop button/timer/bar column left to better balance its left/right padding.

## TODO
- Configure the `NUMBER_LOG_KEY` Worker secret before using the private `/number-log` endpoint.
