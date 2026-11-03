# Doku Puppies — store listing

Copy-paste material for Google Play Console (and App Store Connect if an iOS wrapper is ever made).
Character limits are noted next to each field; every text below fits.

## Facts the listing can promise

- Free. No ads. No in-app purchases. No account, no sign-in, no tracking SDKs.
- 160 hand-checked campaign levels in six walks, 5×5 → 11×11, then Endless Walkies.
- A new shared daily puzzle every day, with streaks.
- Free play on any size from 5×5 to 12×12 and any difficulty.
- Sniff hints that explain the next logical step; Fetch reveals a pup when you are stuck.
- 23 pups to adopt (walk bosses, streaks, feats, seasonal events); your companion sits on the board.
- Works offline after the first launch; phones, tablets and Android TV (D-pad).
- Progress is saved on the device and mirrored to a cloud backup under an anonymous key; link two devices with a 6-letter code.

---

## Google Play

**App name** (30 max): `Doku Puppies`

**Short description** (80 max, 72 used):
`Free puppy logic puzzles. No ads. Seat one pup per row, column and yard!`

**Full description** (4000 max, no HTML):

```
Doku Puppies is a free, cosy logic puzzle with no ads and nothing to buy. Seat exactly one pup in every row, every column and every coloured yard — and keep them apart, because pups never touch, not even at the corners. Every board has a single solution you can reach by pure deduction. No guessing, no countdown, no pressure.

FUN, FAIR GAMEPLAY
• Tap to cross off a square, tap again to clear it. Double-tap (or hold) to seat a pup, drag to cross off a whole run.
• Three hearts per board: a pup on the wrong square costs one, so think it through.
• Earn stars for clean solves, treats for every win, and tricks (trophies) for feats.

HINTS THAT ACTUALLY TEACH
• Sniff explains the next deduction in plain words and lights up the squares involved — "the pond yard only fits in row 3", "these two rows share two yards" — then seats the pup or crosses off the squares for you if you want.
• Fetch reveals one correct pup when you are truly stuck.
• Three Sniffs are free on every board; more cost a few treats you earn by playing.

A LOT TO PLAY
• 160 campaign levels across six walks: Puppy Park, Backyard, Beach Day, Forest Trail, Snowy Hills and City Lights, from 5×5 starters to 11×11 brain-benders, with a tougher boss board at the end of every walk.
• Endless Walkies after the campaign — new boards forever.
• A daily puzzle shared by every player, with streaks and bonus treats.
• Free play: pick any size from 5×5 to 12×12 and any difficulty from Puppy to Legend.
• Every board is graded by the real deduction techniques it needs, so the difficulty you pick is the difficulty you get.

ADOPT THE WHOLE KENNEL
• 23 pups to collect: finish a walk, keep a streak, pull off a feat, or play a seasonal event (Howl-o-ween, Santa Paws, Puppy Love, Lucky Pup, Spring Hop, Beach Days, Fall Walkies).
• Your chosen companion sits beside the board, sniffs out hints and celebrates your wins.
• Yards are real ground a dog would walk on — grass, clover, sand, trails, boardwalks, ponds, leaf piles, lavender — inside a little picket fence, with birds, butterflies, frogs and ducks wandering through.

MADE FOR THE WAY YOU PLAY
• Phones and tablets in any orientation; Android TV and Google TV with the remote's D-pad.
• Works offline after the first launch.
• Big-text, reduced-motion, sound and haptics settings.
• Progress is saved on your device and backed up under an anonymous key; link your phone, tablet and TV with a six-letter code. No account needed.

If you like Sudoku, Star Battle or the daily "one queen per region" puzzle, you already know the rules. Doku Puppies just adds the dogs.

Free, no ads, no purchases — just puzzles and puppies.
```

**Category:** Games › Puzzle · **Tags:** Logic, Brain, Casual, Cute, Dogs
**Contains ads:** No · **In-app purchases:** No · **Free**

**Content rating questionnaire:** no violence, no gambling, no user interaction/chat, no sharing of location. Expected result: Everyone / PEGI 3.

**Target audience:** 13-15, 16-17, 18+ (declared; the game is for everyone but declaring under-13 audiences brings the Families policy review; the content is still rated Everyone).

**Data safety form:**
- Does the app collect or share user data? **Yes, collects** (game progress is backed up to Firebase so it survives reinstalls). Not shared with third parties. Declared **required** because the backup starts automatically with no opt-in switch (make it optional in the form only if a "cloud backup" toggle is added to Settings).
- Data types declared: *App activity → Other actions* (gameplay progress, settings, chosen pup) and *Device or other IDs* (the random profile key the backup is stored under). Purpose: App functionality. Not processed ephemerally. Encrypted in transit: Yes.
- No personal info, no location, no financial info, no contacts, no photos. No account creation; no external login.
- Data deletion: "Yes" with the privacy page as the request URL (`https://azarzycki.github.io/doku-puppies/privacy.html`, which explains deletion by GitHub issue).
- Privacy policy URL: `https://azarzycki.github.io/doku-puppies/privacy.html` (also linked from Settings inside the app, as Play requires).

**Assets:**
- App icon 512×512: `icons/icon-512.png`
- Feature graphic 1024×500: `store/feature-graphic.png`
- Screenshots: `store/screenshots/` (run `node tools/screenshots.js` against a running copy of the site: phone 1080×1920, 7" tablet 1200×1920, 10" tablet 2560×1600, TV 1920×1080)
- Upload: `app-release.aab` from the "Build Android app" workflow (Releases → latest). Package `ca.zarzycki.dokupuppies`, bump `versionCode` in `android/app/build.gradle` for every upload.

**Release notes (500 max):**
`First release: 160 levels in six walks, a daily puzzle with streaks, free play up to 12×12, hints that explain the next move, and 23 pups to adopt. Free, no ads.`

---

## App Store Connect (if an iOS wrapper is added later)

- **Name** (30): `Doku Puppies`
- **Subtitle** (30): `Cosy puppy logic puzzles`
- **Promotional text** (170): `Seat one pup per row, column and yard — pups never touch! Hints that explain the next move, a daily board, 160 levels, 23 pups to adopt. Free, no ads, no purchases.`
- **Keywords** (100): `puzzle,logic,dog,puppy,star battle,sudoku,brain,daily,cute,relaxing,offline,no ads,cosy` (no other product names)
- **Description:** same text as the Google Play full description.
- **Category:** Games › Puzzle (secondary: Family) · **Age rating:** 4+
- **Privacy nutrition label:** Data not linked to you — "Other usage data" (game progress) for App Functionality.
