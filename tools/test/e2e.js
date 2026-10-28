// End-to-end tests for Thermal, run in headless Chromium at iPhone size.
//   python3 -m http.server 8765 --directory www &
//   node tools/test/e2e.js [shots-dir]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const BASE = process.env.BASE || 'http://localhost:8765/';
const SHOTS = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, {recursive: true});
const H = 36e5, D = 864e5;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

function fixture() {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-v1-backup.json')));
  // move the sessions into the last few days so recovery has something to show
  const now = Date.now();
  const at = [now - 20 * H, now - 3 * D, now - 9 * D];
  f.sessions.forEach((s, i) => { s.ended = at[i]; s.started = at[i] - H; });
  const p = path.join(SHOTS, 'fixture.json');
  fs.writeFileSync(p, JSON.stringify(f));
  return p;
}

async function newPage(browser, init) {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true});
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|sw\.js/.test(m.text())) errors.push(m.text()); });
  return {ctx, page, errors};
}
const shot = async (page, name) => { await page.waitForTimeout(450); await page.screenshot({path: path.join(SHOTS, name + '.png')}); };
const sheetTop = page => page.locator('.sheet').last();

(async () => {
  const browser = await chromium.launch();
  const fx = fixture();

  console.log('\n# Boot and import an old (v1) backup');
  let {page, errors} = await newPage(browser);
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('text=Nothing here yet');
  ok(true, 'empty app shows welcome card');
  await page.click('[data-import-first]');
  await page.setInputFiles('#i-file', fx);
  await page.click('.sheet [data-go]');
  await page.waitForSelector('.daycard');
  ok(await page.locator('.daycard').count() === 3, 'v1 backup restored 3 days');
  const st = await page.evaluate(() => ({v: S.version, n: S.sessions.length, bar: S.barKg}));
  ok(st.v === 2 && st.n === 3 && st.bar === 20, 'state migrated to v2 with sessions and bar weight');
  await page.waitForFunction(() => LIB.loaded);
  const libCount = await page.evaluate(() => LIB.list.length);
  ok(libCount > 650, `library loaded (${libCount} exercises)`);

  console.log('\n# Muscle matching');
  const m = await page.evaluate(() => {
    const top = n => Object.entries(musclesFor(n)).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      ez: top('EZ-Bar Curls'), shrugs: top('Shrugs'), rear: top('Rear Delts'), raise: top('Shoulder Raise'),
      back: top('Back Extension'), nordic: top('Nordic Curl'), rpd: top('Reverse Pec Deck'), arnold: top('Arnold Press'),
      upright: top('Upright Row'), front: top('Front Raise'), step: top('Step Up'), swing: top('Kettlebell Swing'),
      hlr: top('Hanging Leg Raise'), cross: top('Cable Crossover'), add: top('Hip Adduction'), abd: top('Hip Abduction'),
      wood: top('Woodchopper'), landmine: top('Landmine Press'), seatedDb: top('Seated Dumbbell Press'),
      pushPress: top('Push Press'), custom: top('My weird face pull thing'), auto: top('Zercher Squats'),
      canon: canon('Shrugs') === canon('barbell shrug') && canon('EZ-Bar Curls') === canon('ez bar curl'),
    };
  });
  const expect = {ez: 'biceps', shrugs: 'traps', rear: 'rear_delts', raise: 'side_delts', back: 'lower_back',
    nordic: 'hamstrings', rpd: 'rear_delts', arnold: 'front_delts', upright: 'side_delts', front: 'front_delts',
    step: 'quads', swing: 'glutes', hlr: 'abs', cross: 'chest', add: 'adductors', abd: 'abductors', wood: 'obliques',
    landmine: 'front_delts', seatedDb: 'front_delts', pushPress: 'front_delts', custom: 'rear_delts', auto: 'quads'};
  for (const k in expect) ok(m[k] === expect[k], `${k} → ${m[k]}`);
  ok(m.canon, 'aliases share history (Shrugs = Barbell Shrug, EZ-Bar Curls = EZ Bar Curl)');

  console.log('\n# Body map has inner and outer thigh');
  ok(await page.evaluate(() => document.createElement('div').innerHTML = FRONT, null) !== null, 'svg present');
  const thigh = await page.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = bodyMap({}, {id: 'x'});
    return ['adductors', 'abductors'].map(k => d.querySelectorAll(`[data-m="${k}"]`).length);
  });
  ok(thigh[0] === 4 && thigh[1] === 4, 'adductors and abductors drawn on both views, both sides');

  console.log('\n# Plan: add from library');
  await page.click('[data-tab="plan"]');
  await page.locator('[data-addex]').nth(1).click();          // Back day
  await page.fill('#pk-q', 'bulgarian');
  await page.waitForSelector('.pk-main');
  const firstHit = await page.locator('.pk-n').first().textContent();
  ok(firstHit === 'Bulgarian Split Squat', `search "bulgarian" → ${firstHit}`);
  await page.fill('#pk-q', 'rdl');
  ok((await page.locator('.pk-n').first().textContent()) === 'Romanian Deadlift', 'alias search "rdl" finds Romanian Deadlift');
  await page.fill('#pk-q', '');
  await page.click('[data-g="thigh"]');
  const thighList = await page.locator('.pk-n').allTextContents();
  ok(thighList.includes('Hip Adduction Machine') && thighList.includes('Hip Abduction Machine'), 'Inner & outer thigh filter lists hip machines');
  await shot(page, '03-picker-thigh');
  await page.click('[data-g="all"]');
  await page.click('[data-e="cable"]');
  const allCable = await page.evaluate(() => [...document.querySelectorAll('.pick .sub')].every(s => /Cable/.test(s.textContent)));
  ok(allCable, 'equipment filter shows only cable exercises');
  await page.click('[data-e="any"]');
  await page.fill('#pk-q', 'face pull');
  await page.locator('[data-info]').first().click();
  await page.waitForSelector('.photos img');
  ok(await page.locator('.steps li').count() >= 1 && await page.locator('.photos img').count() === 2, 'info sheet shows photos and instructions');
  await shot(page, '04-info-facepull');
  await sheetTop(page).locator('[data-close]').click();
  await page.locator('[data-pick]').first().click();
  await page.waitForSelector('text=Edit exercise');
  ok((await page.textContent('#f-name')) === 'Face Pull', 'picked exercise opens the editor');
  await page.click('[data-rest="60"]');
  await page.click('.sheet [data-save]');
  const added = await page.evaluate(() => S.plans[0].days[1].exercises.slice(-1)[0]);
  ok(added.name === 'Face Pull' && added.rest === 60 && added.sets === 3, 'Face Pull added with 60s rest');

  console.log('\n# Plan: superset and custom exercise');
  await page.locator('[data-editex]').filter({hasText: 'Lat Pulldown'}).click();
  await page.click('.sheet [data-a="link"]');                 // superset with Chest Supported Row
  await page.click('.sheet [data-save]');
  const grp = await page.evaluate(() => { const L = S.plans[0].days[1].exercises; return [L[1].group, L[2].group, L[0].group]; });
  ok(grp[0] && grp[0] === grp[1] && !grp[2], 'Lat Pulldown + Chest Supported Row linked as a superset');
  ok(await page.locator('.superset.plan').count() === 1, 'plan shows the superset bracket');
  await page.locator('[data-addex]').nth(0).click();
  await page.fill('#pk-q', 'Wrist spinner thing');
  await page.click('[data-custom]');
  await page.click('.sheet [data-save]');
  ok(await page.evaluate(() => S.plans[0].days[0].exercises.some(e => e.name === 'Wrist spinner thing')), 'custom exercise can be added');
  await shot(page, '05-plan');

  console.log('\n# Session: prefill, set types, warm-ups, records');
  await page.click('[data-tab="train"]');
  await page.locator('.daycard').first().click();              // Arms
  await page.waitForSelector('[data-start]');
  await shot(page, '06-day-preview');
  await page.click('[data-start]');
  const pre = await page.evaluate(() => S.active.exercises[0].sets.map(s => `${s.weight}x${s.reps}`).join(','));
  ok(pre === '20x12,20x10,20x9', `EZ-Bar Curls prefilled per set from last time (${pre})`);
  // set type cycling
  const card0 = page.locator('[data-ex="0"]');
  await card0.locator('[data-type]').nth(2).click();
  await card0.locator('[data-type]').nth(2).click();
  ok(await page.evaluate(() => S.active.exercises[0].sets[2].t) === 'd', 'tapping set number cycles W → D');
  // warm-ups through the menu
  await card0.locator('[data-menu]').click();
  await page.click('.sheet [data-a="warm"]');
  await page.fill('#wu-w', '40');
  const wu = await page.locator('.wu').allTextContents();
  ok(wu.length === 4 && /10 kg × 10/.test(wu[0]), `40 kg EZ bar → ${wu.length} warm-ups (${wu.map(t => t.replace(/\s+/g, ' ').trim()).join(' | ')})`);
  await page.click('.sheet [data-go]');
  const sets0 = await page.evaluate(() => S.active.exercises[0].sets.map(s => s.t || 'n'));
  ok(sets0.slice(0, 4).join('') === 'wwww' && sets0.length === 7, 'warm-ups inserted above working sets');
  // tick a warm-up: no heat
  await page.locator('[data-ex="0"] [data-tick]').first().click();
  ok(await page.evaluate(() => (sessionLoad(S.active).biceps || 0) === 0), 'a ticked warm-up adds no heat');
  ok(await page.locator('#rest').count() === 1, 'rest timer starts after a warm-up');
  // a record: 20 x 15 beats 20 x 12
  await page.locator('[data-ex="0"] [data-set="4"] [data-f="reps"]').fill('15');
  await page.locator('[data-ex="0"] [data-set="4"] [data-f="reps"]').blur();
  await page.locator('[data-ex="0"] [data-set="4"] [data-tick]').click();
  await page.waitForSelector('.toast.pr');
  ok(/New record/.test(await page.textContent('.toast.pr')), 'beating your best e1RM shows a record toast');
  ok(await page.evaluate(() => sessionLoad(S.active).biceps === 1), 'working set adds heat');

  console.log('\n# Rest timer regressions');
  const nodes = await page.evaluate(async () => {
    let created = 0; const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = n => { if (n.id === 'rest') created++; return orig(n); };
    for (let i = 0; i < 20; i++) tickRest();
    document.body.appendChild = orig;
    return {created, count: document.querySelectorAll('#rest').length};
  });
  ok(nodes.created === 0 && nodes.count === 1, 'repeated ticks mutate one rest element (no flicker)');
  const restSec = await page.evaluate(() => rest.total);
  ok(restSec === 90, 'rest uses the default 90s');

  console.log('\n# Plate calculator');
  await card0.locator('[data-menu]').click();
  await page.click('.sheet [data-a="plates"]');
  await page.fill('#pl-w', '85');
  await page.click('[data-b="20"]');
  ok(/Each side: 25 \+ 5 \+ 2\.5/.test(await page.textContent('#pl-out')), '85 kg on a 20 kg bar → 25 + 5 + 2.5 per side');
  await page.fill('#pl-w', '86');
  ok(/Closest you can load is 85/.test(await page.textContent('#pl-out')), '86 kg → closest loadable 85');
  await shot(page, '07-plates');
  await sheetTop(page).locator('[data-close]').click();

  console.log('\n# Supersets in a session');
  // link exercise 1 (Skullcrushers) with 2 (Cable Curl) and set 2-minute rest on Cable Curl
  await page.locator('[data-ex="1"] [data-menu]').click();
  await page.click('.sheet [data-a="link"]');
  await page.locator('[data-ex="2"] [data-menu]').click();
  await page.click('.sheet [data-rest="120"]');
  ok(await page.locator('.superset').count() === 1, 'session shows superset');
  ok(await page.evaluate(() => S.plans[0].days[0].exercises[2].rest === 120), 'rest change sticks to the plan');
  await page.locator('[data-ex="1"] [data-tick]').first().click();
  ok(await page.locator('#rest').count() === 0, 'first exercise in a superset skips rest');
  await page.locator('[data-ex="2"] [data-tick]').first().click();
  ok(await page.evaluate(() => rest && rest.total === 120), 'last exercise in the superset rests 2 min');
  await shot(page, '08-session');

  console.log('\n# Add exercise mid-session');
  await page.click('[data-addex-live]');
  await page.fill('#pk-q', 'hammer');
  await page.check('#pk-keep');
  await page.locator('[data-pick]').first().click();
  const live = await page.evaluate(() => ({s: S.active.exercises.slice(-1)[0].name, p: S.plans[0].days[0].exercises.slice(-1)[0].name}));
  ok(live.s === 'Hammer Curl' && live.p === 'Hammer Curl', 'Hammer Curl added to session and plan');

  console.log('\n# Finish, log, history');
  await page.click('[data-finish]');
  await page.waitForSelector('text=Every set you finished');
  ok(await page.locator('.pr').count() >= 1, 'log marks the record');
  await shot(page, '09-log');
  await page.locator('.logex').first().click();
  await page.waitForSelector('.chart');
  ok(await page.locator('.chart .dot').count() >= 3, 'exercise history chart plots sessions');
  await shot(page, '10-history');
  await sheetTop(page).locator('[data-close]').click();

  console.log('\n# Body: heat and recovery');
  await page.click('[data-tab="body"]');
  await page.click('[data-mode="rec"]');
  await page.waitForSelector('text=Still recovering');
  const recov = await page.evaluate(() => { const f = fatigueAt(Date.now()); return {biceps: f.biceps || 0, chest: f.chest || 0}; });
  ok(recov.biceps > 0.15, `biceps still recovering (${Math.round(100 * (1 - recov.biceps))}% recovered)`);
  const later = await page.evaluate(() => Object.keys(fatigueAt(Date.now() + 7 * 864e5)).length);
  ok(later === 0, 'everything fresh a week later');
  await shot(page, '11-recovery');
  await page.click('[data-mode="heat"]');
  await shot(page, '12-heat');

  console.log('\n# Export and round-trip');
  await page.click('[data-tab="plan"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp-backup]')]);
  const outPath = path.join(SHOTS, 'export.json'); await dl.saveAs(outPath);
  const exp = JSON.parse(fs.readFileSync(outPath));
  ok(exp.kind === 'thermal.backup' && exp.version === 2 && exp.sessions.length === 4, 'backup exported as v2 with 4 sessions');
  ok(exp.sessions[0].exercises[0].sets.some(s => s.t === 'w'), 'export keeps warm-up tags');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

  // re-import in a fresh browser
  ({page, errors} = await newPage(browser));
  await page.goto(BASE + 'index.html');
  await page.click('[data-import-first]');
  await page.setInputFiles('#i-file', outPath);
  await page.click('.sheet [data-go]');
  await page.waitForSelector('.daycard');
  const rt = await page.evaluate(() => ({n: S.sessions.length, g: S.plans[0].days[1].exercises[1].group, r: S.plans[0].days[0].exercises[2].rest}));
  ok(rt.n === 4 && rt.g && rt.r === 120, 'round-trip keeps sessions, supersets and rest times');
  // prefill skips nothing after round trip: warm-ups come back
  await page.locator('.daycard').first().click();
  await page.click('[data-start]');
  const again = await page.evaluate(() => S.active.exercises[0].sets.map(s => s.t || 'n').join(''));
  ok(again === 'wnnn', `next session brings back the warm-up you did, then the planned 3 working sets (${again})`);
  ok(errors.length === 0, 'no page errors after re-import');

  console.log('\n# Native bridge (stubbed Capacitor)');
  const stub = () => {
    const files = {}; window.__calls = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      nativePromise: async (plugin, method, opts) => {
        window.__calls.push([plugin, method, JSON.parse(JSON.stringify(opts || {}))]);
        if (plugin === 'Filesystem' && method === 'readFile') {
          const k = opts.directory + '/' + opts.path; if (!(k in files)) throw new Error('File does not exist'); return {data: files[k]};
        }
        if (plugin === 'Filesystem' && method === 'writeFile') { files[opts.directory + '/' + opts.path] = opts.data; return {uri: 'file:///' + opts.path}; }
        if (plugin === 'Share') throw new Error('Share canceled');
        return {};
      }
    };
    window.__files = files;
  };
  ({page, errors} = await newPage(browser, stub));
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('text=Nothing here yet');
  await page.click('[data-new-day]');
  await page.fill('#d-name', 'Legs');
  await page.click('.sheet [data-save]');
  await page.evaluate(() => writeNow());
  await page.waitForTimeout(50);
  const saved = await page.evaluate(() => JSON.parse(window.__files['LIBRARY/thermal-data.json'] || 'null'));
  ok(saved && saved.plans[0].days[0].name === 'Legs', 'app data saved to a file in Library');
  ok(await page.evaluate(() => !navigator.serviceWorker || !navigator.serviceWorker.controller), 'no service worker in the app');
  // reload: data must come back from the file even with localStorage wiped
  await page.evaluate(() => localStorage.clear());
  const files = await page.evaluate(() => window.__files);
  await page.addInitScript(f => { window.__seed = f; }, files);
  await page.addInitScript(() => { Object.assign(window.__files, window.__seed || {}); });
  await page.reload();
  await page.waitForSelector('text=Legs');
  ok(true, 'data reloads from the file after localStorage is cleared');
  // rest notification
  await page.click('[data-tab="plan"]');
  await page.click('[data-addex]');
  await page.fill('#pk-q', 'leg press');
  await page.locator('[data-pick]').first().click();
  await page.click('.sheet [data-save]');
  await page.click('[data-tab="train"]');
  await page.locator('.daycard').first().click();
  await page.click('[data-start]');
  await page.locator('[data-tick]').first().click();
  await page.waitForTimeout(100);
  let calls = await page.evaluate(() => window.__calls.map(c => c[0] + '.' + c[1]));
  ok(calls.includes('LocalNotifications.requestPermissions'), 'asks for notification permission on first set');
  const sched = await page.evaluate(() => window.__calls.find(c => c[1] === 'schedule'));
  ok(sched && sched[2].notifications[0].title === 'Rest over' && /Leg Press/.test(sched[2].notifications[0].body), 'schedules "Rest over" notification naming the next set');
  ok(calls.includes('Haptics.impact'), 'uses native haptics');
  await page.click('[data-skip]');
  calls = await page.evaluate(() => window.__calls.map(c => c[0] + '.' + c[1]));
  ok(calls.filter(c => c === 'LocalNotifications.cancel').length >= 2, 'skipping rest cancels the notification');
  await page.click('[data-finish]');
  await page.click('[data-tab="plan"]');
  await page.click('[data-exp-backup]');
  await page.waitForTimeout(100);
  const share = await page.evaluate(() => window.__calls.filter(c => c[0] === 'Share' || (c[1] === 'writeFile' && c[2].directory === 'CACHE')));
  ok(share.length === 2 && /thermal-backup-/.test(share[1][2].files[0]), 'export writes a file and opens the iOS share sheet');
  ok(await page.locator('.toast').count() === 0, 'cancelling the share sheet shows no error');
  ok(errors.length === 0, 'no page errors in native mode' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
