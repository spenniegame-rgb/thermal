#!/usr/bin/env python3
"""Build Thermal's exercise library.

Inputs
  tools/curated.txt                      hand-tuned exercises (the ones that matter most)
  <fedb>/dist/exercises.json             free-exercise-db (public domain, Unlicense)
  <fedb>/exercises/<id>/{0,1}.jpg        its photos

Outputs
  www/index.html   the curated table is written between /*LIB:BEGIN*/ and /*LIB:END*/
  www/library.json the rest of free-exercise-db, auto-mapped to Thermal's muscles,
                   plus instructions for every exercise that has photos
  www/ex/<id>/     photos, resized for phones

Usage:  python3 tools/build-library.py /path/to/free-exercise-db [--no-images]
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')

MUSCLES = ['chest', 'front_delts', 'side_delts', 'rear_delts', 'traps', 'lats', 'upper_back',
           'lower_back', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads',
           'hamstrings', 'calves', 'neck', 'adductors', 'abductors']
EQUIP = {'barbell', 'dumbbell', 'cable', 'machine', 'smith', 'ezbar', 'kettlebell',
         'bodyweight', 'band', 'other'}


def key(s):
    """Must match key() in index.html exactly."""
    s = (s or '').lower().replace('&', ' and ')
    words = re.sub(r'[^a-z0-9]+', ' ', s).strip().split()
    words = [w[:-1] if len(w) > 3 and re.search(r'[^s]s$', w) else w for w in words]
    s = ''.join(words)
    return re.sub(r'flye|flie', 'fly', s)


def parse_curated(path, fedb_ids):
    out, errors = [], []
    for ln, line in enumerate(open(path), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) != 5:
            errors.append(f'line {ln}: expected 5 fields'); continue
        name, fid, eq, mspec, aliases = parts
        if fid and fid not in fedb_ids:
            errors.append(f'line {ln}: unknown free-exercise-db id {fid}')
        if eq not in EQUIP:
            errors.append(f'line {ln}: unknown equipment {eq}')
        m = {}
        for tok in mspec.split(','):
            k, v = tok.split()
            if k not in MUSCLES:
                errors.append(f'line {ln}: unknown muscle {k}')
            m[k] = float(v)
        out.append({'n': name, 'id': fid, 'eq': eq, 'm': m,
                    'a': [a.strip() for a in aliases.split(',') if a.strip()]})
    if errors:
        sys.exit('\n'.join(errors))
    # aliases must not collide across exercises
    seen = {}
    for e in out:
        for k in {key(e['n']), *map(key, e['a'])}:
            if k in seen and seen[k] != e['n']:
                sys.exit(f'alias collision: "{k}" used by {seen[k]} and {e["n"]}')
            seen[k] = e['n']
    return out, seen


# ---- auto-mapping free-exercise-db's 17 muscle names onto Thermal's 20 ----
REAR = re.compile(r'rear|reverse fl|face pull|pull apart|back fl|external rotation|bent.over.*(lateral|raise)|sled reverse')
SIDE = re.compile(r'lateral|upright|scaption|deltoid raise|iron cross|crucifix|side lateral|incline shoulder raise|cuban')
OBLQ = re.compile(r'oblique|twist|side bend|windmill|wood ?chop|russian|side bridge|judo|pallof|cable lift|figure 8|180|side jackknife|heel touch|bent press')
EQMAP = {'barbell': 'barbell', 'dumbbell': 'dumbbell', 'cable': 'cable', 'machine': 'machine',
         'body only': 'bodyweight', 'e-z curl bar': 'ezbar', 'kettlebells': 'kettlebell',
         'bands': 'band'}


def auto_muscles(x):
    name = x['name'].lower()
    out = {}

    def add(k, v):
        out[k] = max(out.get(k, 0), v)

    def place(src, v, primary_src):
        if src == 'shoulders':
            if REAR.search(name):
                add('rear_delts', v)
            elif SIDE.search(name):
                add('side_delts', v)
            elif primary_src in ('self', 'shoulders', 'chest', 'triceps'):
                add('front_delts', v)
                if primary_src == 'self':
                    add('side_delts', round(v * .45, 2))
            elif primary_src in ('lats', 'middle back'):
                add('rear_delts', v)
            else:
                add('front_delts', v)
        elif src == 'abdominals':
            if OBLQ.search(name):
                add('obliques', v); add('abs', round(v * .5, 2))
            else:
                add('abs', v); add('obliques', round(v * .3, 2))
        else:
            add({'quadriceps': 'quads', 'middle back': 'upper_back', 'lower back': 'lower_back'}.get(src, src), v)

    prim = x['primaryMuscles'][0] if x['primaryMuscles'] else None
    for p in x['primaryMuscles']:
        place(p, 1.0, 'self')
    for s in x['secondaryMuscles']:
        place(s, 0.4, prim)
    # a secondary never outranks a primary that maps to the same group
    return {k: round(v, 2) for k, v in out.items()}


def tidy_name(n):
    n = n.replace(' - ', ' — ').replace('  ', ' ')
    return n.strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    fedb = sys.argv[1]
    images = '--no-images' not in sys.argv
    data = json.load(open(os.path.join(fedb, 'dist', 'exercises.json')))
    by_id = {x['id']: x for x in data}

    cur, taken = parse_curated(os.path.join(ROOT, 'tools', 'curated.txt'), set(by_id))
    cur_ids = {e['id'] for e in cur if e['id']}

    auto = []
    for x in data:
        if x['category'] in ('stretching', 'cardio', 'plyometrics'):
            continue
        if x['id'] in cur_ids:
            continue
        nm = tidy_name(x['name'])
        k = key(nm)
        if k in taken:
            continue
        m = auto_muscles(x)
        if not m:
            continue
        taken[k] = nm
        auto.append([nm, m, EQMAP.get(x.get('equipment') or '', 'other'), x['id']])
    auto.sort(key=lambda r: r[0].lower())

    info = {}
    for i in sorted(cur_ids | {r[3] for r in auto}):
        x = by_id[i]
        info[i] = {'i': x['instructions'], 'p': len(x['images']), 'lv': x.get('level')}

    # curated table, inlined so muscle matching works before library.json loads
    cur_js = json.dumps([[e['n'], e['m'], e['eq'], e['id'], e['a']] for e in cur],
                        separators=(',', ':'), ensure_ascii=False)
    html_path = os.path.join(WWW, 'index.html')
    html = open(html_path).read()
    new = re.sub(r'/\*LIB:BEGIN\*/.*?/\*LIB:END\*/',
                 lambda _: '/*LIB:BEGIN*/' + cur_js + '/*LIB:END*/', html, flags=re.S)
    if new == html and '/*LIB:BEGIN*/' not in html:
        sys.exit('index.html has no /*LIB:BEGIN*/ marker')
    open(html_path, 'w').write(new)

    lib = {'v': 1, 'source': 'free-exercise-db (public domain) + Thermal curation',
           'auto': auto, 'info': info}
    json.dump(lib, open(os.path.join(WWW, 'library.json'), 'w'),
              separators=(',', ':'), ensure_ascii=False)

    n_img = 0
    if images:
        from PIL import Image
        for i, meta in info.items():
            d = os.path.join(WWW, 'ex', i)
            os.makedirs(d, exist_ok=True)
            for p in range(meta['p']):
                src = os.path.join(fedb, 'exercises', i, f'{p}.jpg')
                dst = os.path.join(d, f'{p}.jpg')
                if os.path.exists(dst) or not os.path.exists(src):
                    continue
                im = Image.open(src).convert('RGB')
                w = 420
                im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
                im.save(dst, 'JPEG', quality=68, optimize=True, progressive=True)
                n_img += 1

    print(f'curated {len(cur)} ({len(cur_ids)} with photos), auto {len(auto)}, '
          f'info {len(info)}, new images {n_img}')


if __name__ == '__main__':
    main()
