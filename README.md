# Pupdoku 🐾

A puppy-themed take on the "one per row, column and region" logic puzzle (the mechanism behind Meowdoku / Queens / Star Battle), served from GitHub Pages and wrapped in a small Android app.

- **Play in a browser:** https://azarzycki.github.io/pupdoku/
- **Android app (APK):** https://azarzycki.github.io/pupdoku/apk/ → redirects to the latest release
- Sister project: [tv-trivia](https://github.com/azarzycki/tv-trivia) (same hosting + Firebase pattern)

## The game

Seat exactly one pup in every **row**, every **column** and every coloured **yard**. Pups never touch — not even diagonally. Every board has exactly one solution and can be solved without guessing.

| Feature | Details |
| --- | --- |
| Controls | Tap = cross off ✕, tap again = seat a pup, tap a pup = clear. Hold = seat a pup straight away. Drag = cross off many squares. D-pad / keyboard: arrows move, OK/Enter cycles, `X` cross, `P` pup, `U` undo, `H` sniff. |
| Hearts | 3 per puzzle; a pup on a wrong square costs one. Out of hearts → restart or spend 🦴 5 for one more. |
| **Sniff 🐽** (hint) | Explains the *next deduction* and highlights the squares involved; tap again to apply it. Techniques: personal space, only-one-spot, yard lock, line lock, too-crowded, paired/trio yards, what-if chains. 3 free per puzzle, then 🦴 1 each. |
| **Fetch 🦴** | Reveals one correct pup for 🦴 3. |
| Stars | ★★★ = no hearts lost and no hints. |
| Campaign | 160 pre-generated levels in six walks (Puppy Park → City Lights), 5×5 up to 11×11, then **Endless Walkies** (seeded, identical for everyone). |
| Daily | One shared board per day (same for every player), streaks with bonus treats, replayable calendar. |
| Free play | Any size 5×5–12×12 and any rank Puppy → Legend, from a pre-generated bank (plus on-device generation for small boards). |
| Difficulty ranking | Every board is graded by the deduction techniques a human solver needs, scaled by board size: 🐾 Puppy, 🐾🐾 Good dog, 🐾🐾🐾 Clever, 🐾🐾🐾🐾 Top dog, 🐾🐾🐾🐾🐾 Legend. |
| Prizes | 🦴 treats for levels, three-star solves, dailies, streak milestones, *today's tricks* (three rotating daily goals) and *tricks* (trophies). A kennel of 23 pups to adopt (walk bosses, streaks, feats, seasonal events); the chosen companion sits on the board with you. |
| Events | Seasonal windows every year (Howl-o-ween, Santa Paws, Puppy Love, Lucky Pup, Spring Hop, Beach Days, Fall Walkies): five event boards each, adopt the event pup. |
| Offline | Installable PWA; the service worker caches the whole game. |
| Sync | Progress is saved on the device and mirrored to Firebase; link devices with a 6-letter code (Settings). |

## Layout

```
index.html            app shell (all screens)
css/style.css         styling + animations
js/engine.js          generator, uniqueness solver, human-technique solver (hints + difficulty ranking)
js/game.js            one puzzle session: board, input, hearts, timer, undo, hints
js/app.js             screens, navigation, progression, treats, tricks, kennel, events, D-pad support
js/puzzles.js         campaign/bank/daily sources, colour assignment, hint wording
js/pups.js            puppy roster, SVG art, seasonal events
js/store.js           profile, localStorage, Firebase sync + link codes
js/sound.js           synthesised sound effects
js/gen-worker.js      runtime generation off the main thread
data/levels.json      the 160 campaign levels      (generated: node tools/build-levels.js campaign)
data/bank.json        free-play puzzles by size+rank (generated: node tools/build-levels.js bank)
data/daily.json       daily boards 2026-11 → 2028-12 (generated: node tools/build-levels.js daily)
tools/                generator CLI, engine stats, data verifier
android/              WebView wrapper (phones, tablets, Android/Google TV)
apk/                  /apk short link → latest release APK
database.rules.json   Firebase Realtime Database rules (rooms = trivia buzzers, pupdoku = this game)
```

No build step: it is a static site. `python3 -m http.server` in the repo root and open http://localhost:8000/.

## Puzzle generation

`js/engine.js` builds boards in three stages, all seeded so the same seed gives the same board on every device:

1. a random non-touching permutation becomes the solution;
2. yards are grown around the solution cells, then reshaped (boundary cells move between neighbouring yards) until the solver finds exactly one solution;
3. a human-technique solver grades the board. Boards the technique solver can't finish are never shipped, which is what guarantees *Sniff* always has a next step.

`node tools/build-levels.js campaign|bank|daily|all` pre-generates with a worker pool (resumable; output in `tools/out/*.jsonl`, compiled into `data/`). `node tools/verify-data.js` re-checks every shipped puzzle: well formed, unique, graded rank matches, and solvable end-to-end with hints only.

## Firebase

Same project as tv-trivia (`to-trivia`, Realtime Database, free plan). Pupdoku keeps its data under `pupdoku/`:

- `pupdoku/profiles/<key>` — one profile per kennel; the key is a random 128-bit id kept in the device's localStorage.
- `pupdoku/links/<CODE>` — six-letter pairing codes, valid ten minutes.

**One-time setup:** publish `database.rules.json` in the Firebase console (Realtime Database → Rules). It contains both the trivia buzzer rules and the pupdoku rules. Until the rules are published the cloud sync shows as unavailable and the game simply keeps saving locally.

Optional hardening: set `RECAPTCHA_SITE_KEY` in `js/store.js` to turn on App Check (same hook as tv-trivia).

## Android app

`android/` is a bare WebView shell pointing at the hosted page, so updates to the game never need a new APK. It is a normal launcher app (phones and tablets, any orientation) and also registers a Leanback entry so it shows up on Android TV / Google TV, where the page is fully playable with the remote's D-pad. The Back key closes dialogs / goes back a screen before leaving the app.

The `Build Android APK` workflow builds and signs it on every push that touches `android/` and attaches `app-release.apk` to the `latest` release. Build locally with `cd android && gradle assembleRelease` (Android SDK platform 34 + build-tools 34.0.0).

Sideloading on a TV: enable *Unknown sources* for Downloader by AFTVnews, then fetch `https://github.com/azarzycki/pupdoku/releases/latest/download/app-release.apk`.

## Credits

Original art, code and puppies. The puzzle mechanism is the classic "one per row/column/region, no touching" family popularised by Meowdoku and LinkedIn's Queens; this is an independent fan take with dogs.
