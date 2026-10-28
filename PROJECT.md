# Thermal — project handoff

A workout planner and tracker for iPhone. It runs two ways from the same code:
as an installable web app (PWA) on Netlify, and as a native iPhone app (a
Capacitor shell) that the user sideloads with Sideloadly on a free Apple ID.
Its defining feature is a body heat map: the muscles a session works light up,
coloured by how much volume lands on each one.

**Web app:** https://thermal-workout.netlify.app (Netlify project `thermal-workout`,
site ID `e8196f2c-8c85-4174-8c80-2348691c41b0`)
**iPhone app:** built by GitHub Actions → `Thermal.ipa` on the repo's `latest` release
**Bundle ID:** `app.thermalworkout.ios` — never change it, or installs stop updating in place
**Service worker cache:** `thermal-v5`
**State version:** 2
**Last updated:** 28 October 2026

---

## 1. Start here if you're a new session

The user will attach `thermal.zip` (or the GitHub repo will be attached).

```
unzip -oq thermal.zip -d thermal && cd thermal
npm ci                       # only needed for Capacitor / the iOS project
python3 -m http.server 8765 --directory www &
node tools/test/e2e.js       # 76 end-to-end checks, headless Chromium
```

The whole app is still **`www/index.html`** — one file, no build step, no
framework. The exercise library adds `www/library.json` and photos in `www/ex/`.

**Shipping a change**

1. Edit `www/index.html`.
2. Bump `CACHE` in `www/sw.js` (`thermal-v5` → `thermal-v6`). Without it,
   installed web copies keep serving the old version.
3. Run the tests.
4. Push to `main`. GitHub Actions rebuilds `Thermal.ipa`; the user reinstalls it
   with Sideloadly (installing over the old app keeps their data).
5. Web: until Netlify is connected to the repo, the user drags the **`www`
   folder** onto https://app.netlify.com/projects/thermal-workout/deploys.
   (Claude can't deploy to Netlify from the sandbox — its allowlist blocks it.)

---

## 2. File inventory

| Path | Purpose |
|---|---|
| `www/index.html` | The entire app — UI, muscle model, SVG body maps, state, storage, native bridge. ~2,100 lines. |
| `www/library.json` | ~480 auto-mapped exercises + instructions for all 665 with photos. Generated. |
| `www/ex/<id>/{0,1}.jpg` | Exercise photos, 420px wide (~27 MB total). Generated. |
| `www/sw.js` | Service worker (web only). Network-first, cache fallback. |
| `www/manifest.json`, icons | PWA install. |
| `www/_headers` | `no-cache` on `sw.js`, manifest MIME type (works for drag-and-drop deploys). |
| `tools/curated.txt` | **The hand-tuned exercise list.** Edit this, not the generated files. |
| `tools/build-library.py` | Regenerates the library from `curated.txt` + free-exercise-db. |
| `tools/test/e2e.js` | Playwright end-to-end tests, including a stubbed Capacitor bridge. |
| `tools/test/fixture-v1-backup.json` | A v1 backup (the user's original routine) used by the tests. |
| `tools/icon/` | `icon.svg` (the icon, redrawn as vectors) and `render.js` for the 1024 icon + splash. |
| `capacitor.config.json` | App ID, name, `webDir: www`, status bar + notification config. |
| `ios/` | Generated Capacitor Xcode project, customised: icon, dark splash, portrait only, dark mode, version 2.0. Uses Swift Package Manager (no CocoaPods). |
| `.github/workflows/ios.yml` | Builds an unsigned `.ipa` on `macos-latest` and publishes it to the `latest` release. |
| `netlify.toml` | `publish = "www"` for a Git-connected Netlify site. |
| `INSTALL.md` | Install guide for the user and friends (Sideloadly, Windows or Mac). |

---

## 3. Architecture

### State

One object, `S`. Web: `localStorage['thermal:v1']`. iPhone app: the file
`Library/thermal-data.json` (Capacitor Filesystem), with localStorage as a mirror
and first-run fallback — iOS can evict a web view's localStorage under storage
pressure, a file in Library it won't.

```js
S = {
  version: 2, unit: 'kg', restDefault: 90, barKg: 20, barLb: 45,
  hintTypes: true,                       // set-type hint dismissed
  plans: [{ id, name, days: [{ id, name, exercises: [
    { id, name, weight, reps, sets, rest?, group? } ]}]}],
  sessions: [                            // NEWEST FIRST — see §5
    { id, dayId, name, started, ended,
      exercises: [{ name, group?, sets: [{ weight, reps, done, t? }] }] }],
  active: null                           // in-progress session; exercises also carry pid, rest
}
```

- `set.t`: `'w'` warm-up, `'d'` drop set, `'f'` to failure. Absent = normal.
- `exercise.rest`: seconds; absent = `S.restDefault`.
- `exercise.group`: superset id shared by **adjacent** exercises.
- `pid` on a session exercise points at its plan exercise so rest and superset
  changes made mid-session stick to the plan.

`migrate()` fills v2 defaults, so v1 data and v1 backups load unchanged.
`save()` is debounced 300 ms; `writeNow()` flushes, and runs on `visibilitychange → hidden`.

### Native bridge

No bundler, no `@capacitor/core` import. Inside the app, Capacitor injects
`window.Capacitor`; the code calls plugins with
`Capacitor.nativePromise(plugin, method, options)` via `nat()`. `NATIVE` is false
on the web and every native call no-ops. Plugins: Filesystem, LocalNotifications,
Share, Haptics, StatusBar. JS `Date` objects pass straight through to iOS as
`NSDate` (the notification `schedule.at`).

### Rendering

Unchanged pattern: `render()` dispatches on `route.tab`, builds an HTML string,
assigns `app.innerHTML`, wires handlers by `data-*`. `route.view` keeps the day
preview open across re-renders. Re-rendering the session you're already on adds
`.still` to skip the fade-in.

Sheets stack (`sheet()` appends; later ones sit on top). `toast()` is top-centre.

---

## 4. The muscle model

### 20 muscle groups

`chest, front_delts, side_delts, rear_delts, traps, lats, upper_back, lower_back,
biceps, triceps, forearms, abs, obliques, glutes, quads, hamstrings, calves, neck,
adductors ("Inner thigh"), abductors ("Outer thigh")`

The last two were added in v2: adductors on the inner thigh (front and back
views), abductors as the outer hip/thigh (front) and glute medius (back).

### Matching a name to muscles — `musclesFor(name)`

1. **`key(name)`** normalises: lowercase, punctuation and spaces removed, trailing
   plural `s` dropped per word, `flye/flie → fly`. `"EZ-Bar Curls"`, `"ez bar curl"`
   and `"EZbar curl"` are one key. `tools/build-library.py` has an identical `key()`.
2. **Library lookup** by key across every name *and alias*:
   - `LIB_CORE` — 203 curated exercises inlined in `index.html` between
     `/*LIB:BEGIN*/` and `/*LIB:END*/`. Hand-tuned weights and gym-speak aliases.
     The user's original names (`Machine Rows`, `Rear Delts`, `Shoulder Raise`,
     `Chest Fly`, `Shrugs`…) are aliases here.
   - `library.json` — 477 more from free-exercise-db, auto-mapped (primary = 1,
     secondary = 0.4; "shoulders" split into front/side/rear by name). Loaded at
     boot; `muscleCache` clears when it arrives.
3. **`KEYS`** regex fallback for custom names. Order matters — specific first.
   v2 fixed real mis-hits: "back extension" → triceps, "nordic curl" → biceps,
   "reverse pec deck" → chest, Arnold/landmine/push press → chest.

`canon(name)` = the library entry's key, so history unifies across aliases:
"Shrugs" and "Barbell Shrug" share records and prefill.

**To add or retune an exercise:** edit `tools/curated.txt`, then
`python3 tools/build-library.py /path/to/free-exercise-db` (clone
`github.com/yuhonas/free-exercise-db`; add `--no-images` to skip photos). The
script rejects unknown muscles, unknown photo ids, and alias collisions.

### Volume, heat, recovery

- **Sets are the unit of stimulus.** One working set of lat pulldown adds 1.0 to
  lats, 0.55 to biceps. **Warm-ups (`t:'w'`) never count** — not heat, not
  tonnage, not set counts, not records.
- **Heat** (`paintBody`) is relative to the busiest muscle in view, 0.14 floor.
  It shows emphasis, not adequacy.
- **Recovery** (`fatigueAt(now)`) is absolute. Per session and muscle:
  `f0 = min(1, sets/8)`, fading linearly over `48 + 96·f0` hours (2–6 days).
  Summed across sessions, capped at 1. "Fresh" < 0.15. An estimate — the UI says so.

---

## 5. Features and their decisions

### Tabs
- **Train** — day cards; tap for preview (body map, ranked muscles, a "Still
  recovering" note if the day leans on muscles under 60% recovered, exercise list
  with supersets; tap an exercise for its info sheet).
- **Body** — Heat (7/14/30/all days) and Recovery modes.
- **Log** — sessions with PR badges; tap an exercise for history.
- **Plan** — days, exercises (supersets bracketed), units, default rest, bar
  weight, export/import, reset.

### Exercise library picker — `pickExercise()`
Search (names + aliases, ranked: exact → alias → prefix → token match; curated
and previously-logged boosted), muscle-group chips (incl. Recent and Inner &
outer thigh), equipment chips, ⓘ for the info sheet, and "Use ‘…’" for custom
names. Used by Plan → Add exercise, Change exercise, and mid-session Add.

### Info sheet — `openExerciseInfo(name)`
Mini body map, est. 1RM / heaviest / best set, est-1RM line chart (≥2 sessions),
last 15 sessions, photos + steps when the library has them.

### Set logging
Grid row: set label, weight stepper (1.25 kg / 2.5 lb), reps stepper, tick.
**Tap the set label** to cycle normal → W → D → F. Working sets are numbered,
others show their letter.

### Prefill — `prefillSets()`
Last time's **warm-ups come back as warm-ups**, then working set *i* remembers
working set *i*; extra sets inherit the last. Only *ticked* sets are saved, so a
warm-up you skipped doesn't return. Relies on `S.sessions` being newest-first
(`finishSession` uses `unshift`).

### Records
`e1rm(w,r)` = Epley. `prMap()` walks sessions oldest→newest; a session's
exercise is a PR if it beats every earlier session (first appearance isn't).
Ticking a working set that beats your best shows an amber toast.

### Warm-up calculator — `warmupPlan(top, name)`
40%×8, 60%×5, 80%×3 of the top working weight, rounded to 2.5 kg / 5 lb,
floored at the bar; empty bar ×10 first when top > 1.6 × bar. Bar is the
setting for barbell/Smith, 10 kg / 25 lb for EZ bars, none otherwise.

### Plate calculator — `plateSplit()`
Greedy per side: kg 25/20/15/10/5/2.5/1.25, lb 45/35/25/10/5/2.5. Shows the
closest loadable weight when it isn't exact. Bar chips 20/15/10/none (kg) or
45/35/25/none (lb); choosing one for a barbell lift updates the setting.

### Rest timer and supersets
- Wall-clock deadline (`endsAt`), 250 ms tick, element built once and mutated —
  **don't reintroduce either old bug** (flicker; freezing in the background).
  The tests check both.
- Rest length = `exercise.rest || S.restDefault`. Changing it from the session
  menu also updates the plan.
- In a superset, ticking any exercise but the last skips rest and toasts "on to X".
- **iPhone app:** each rest schedules a local notification (`id 4101`) for
  `endsAt` with the next set in the body; +30s reschedules, Skip cancels,
  returning to the app clears delivered ones. Foreground presentation is sound
  only (the in-app timer is already visible). **Web:** best-effort as before.

### Export / import
Backups are `{kind:'thermal.backup', version:2, …, barKg, barLb, plans, sessions}`.
Import accepts v1 and v2, backups and routine files. iPhone app: writes the file
to Cache and opens the iOS share sheet; web: share sheet or download.

---

## 6. iPhone app build and install

- `ios/` was generated on Linux with `npx cap add ios` (Capacitor 8.5.3, SPM).
  `npx cap sync ios` copies `www/` in and rewrites `CapApp-SPM/Package.swift`;
  CI runs it every build, so `ios/App/App/public` isn't committed.
- CI (`.github/workflows/ios.yml`): `macos-latest`, newest stable Xcode via
  `maxim-lobanov/setup-xcode`, `xcodebuild archive` with signing off,
  `Payload/App.app` zipped into `Thermal.ipa`, attached to the `latest` release
  and as an artifact. Build number = workflow run number. The repo is public so
  macOS minutes are free.
- **Install:** Sideloadly (Windows needs the non-Microsoft-Store iTunes and
  iCloud). Free Apple ID → 7-day signature; Sideloadly's daemon auto-refreshes
  over Wi-Fi when "Sync with this iPhone over Wi-Fi" is on in iTunes and the PC is
  awake on the same network. Developer Mode must be on; trust the Apple ID under
  Settings → General → VPN & Device Management. Free accounts: 3 sideloaded apps,
  10 App IDs per 7 days.
- **Updating keeps data** when installed over the existing app with the same
  Apple ID and bundle ID.
- Friends: the web app, or their own Sideloadly + Apple ID, or TestFlight with a
  paid account (needs signing in CI — not set up).

---

## 7. Privacy

No server, account, sync or analytics. Each device keeps its own data. The repo
holds only code. Two devices = two logs. The export button is the only backup.

---

## 8. Testing

`node tools/test/e2e.js [shots-dir]` with `www/` served on :8765. Covers: v1
import + migration, matching (incl. the fixed mis-hits), thigh muscles, picker
search/filters/aliases/custom, info sheet, plan superset/rest, prefill, set
types, warm-ups, no heat from warm-ups, PR toast, rest-timer single element,
plate maths, superset rest skipping, mid-session add, log PRs, history chart,
recovery, export v2 round-trip, and a stubbed Capacitor bridge (file storage
survives cleared localStorage, notification schedule/cancel, haptics, share).

Not testable here: the real iOS build (CI is the check) and on-device behaviour.

---

## 9. Ideas not done yet

- Weekly sets per muscle against target ranges (RP volume landmarks; Liftosaur
  Week Stats). Agreed for round two.
- Progression nudges (double progression: hit the top of the rep range on every
  set → suggest more weight). Agreed for round two.
- Lock-screen / Dynamic Island rest timer (Live Activity) and home-screen widgets
  — need a Swift widget extension. Agreed for round two.
- Connect Netlify to the GitHub repo (push-to-deploy for the web app).
- TestFlight via a paid account, if the friend group grows.
- Light mode (CSS is token-driven).

---

## 10. Working notes

- **The user is on iPhone, in Melbourne, using it one-handed in a gym.** 44px
  tap targets, single column, nothing relies on hover.
- **No frameworks, no bundler.** The same `index.html` runs on the web and in the app.
- **Sandbox resets between sessions.** The zip / repo is the source of truth.
- **Deliver a fresh zip after every change**, plus push to GitHub when connected.
- Exercise photos and instructions: free-exercise-db (Unlicense / public domain),
  originally from wrkout/exercises.json.
