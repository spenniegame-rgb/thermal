# Thermal

A workout planner and tracker with a heat-mapped body: the muscles a session
works light up, coloured by how much work lands on each one.

- **Use it:** see [INSTALL.md](INSTALL.md) — web app or iPhone app.
- **Work on it:** see [PROJECT.md](PROJECT.md).

## What's in it

- Plan workout days from a library of ~680 exercises (photos and how-to steps
  for most), or add your own.
- Log sets one-handed: steppers, per-set memory of last time, warm-up / drop /
  failure tags, supersets, per-exercise rest timers.
- Body heat over 7/14/30 days, plus a recovery view of what's still fatigued.
- Records: estimated 1-rep max, heaviest weight, best set, progress chart.
- Plate and warm-up calculators.
- Backup and share routines as files. No account, no server — data stays on
  your phone.

## Layout

```
www/            the app (index.html is the whole thing) — deploy this folder
ios/            Capacitor iPhone project
tools/          exercise library builder, tests, icon source
.github/        cloud iPhone build → Thermal.ipa on the "latest" release
```

## Develop

```
python3 -m http.server 8765 --directory www   # then open localhost:8765
npm ci && node tools/test/e2e.js              # end-to-end tests
```

Change `www/index.html`, bump `CACHE` in `www/sw.js`, push. GitHub builds the
iPhone app; deploy `www/` to Netlify for the web app.

Exercise photos and instructions from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain).
