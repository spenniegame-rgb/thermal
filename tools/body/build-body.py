#!/usr/bin/env python3
"""Build Thermal's anatomical body map from MuscleMap's male front/back artwork.

Source: github.com/melihcolpan/MuscleMap (MIT, see LICENSE-MuscleMap.txt), extracted
into source-musclemap-male.json as {view: [[slug, {common, left, right}], ...]}.

Writes a compact table into www/index.html between /*BODY:BEGIN*/ and /*BODY:END*/:
  {front:{vb, parts:[[thermalMuscle or '' for silhouette, pathData], ...]}, back:{...}}
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', '..', 'www', 'index.html')

# MuscleMap slug -> Thermal muscle ('' = drawn as silhouette, None = skipped)
FRONT = {
    'chest': 'chest', 'abs': 'abs', 'obliques': 'obliques', 'biceps': 'biceps',
    'triceps': 'triceps', 'forearm': 'forearms', 'deltoids': 'side_delts',
    'frontDeltoid': 'front_delts', 'trapezius': 'traps', 'neck': 'neck',
    'quadriceps': 'quads', 'adductors': 'adductors', 'hipFlexors': 'abductors',
    'calves': 'calves', 'tibialis': 'calves',
    'serratus': '', 'hands': '', 'knees': '', 'ankles': '', 'feet': '', 'head': '', 'hair': '',
}
BACK = {
    'trapezius': 'traps', 'neck': 'neck', 'rearDeltoid': 'rear_delts', 'upperBack': 'lats',
    'rhomboids': 'upper_back', 'rotatorCuff': 'upper_back', 'triceps': 'triceps',
    'forearm': 'forearms', 'lowerBack': 'lower_back', 'gluteal': 'glutes',
    'adductors': 'adductors', 'hamstring': 'hamstrings', 'calves': 'calves',
    'hands': '', 'ankles': '', 'feet': '', 'head': '', 'hair': '',
}
# Draw order: silhouette first, then muscles; sub-regions after the region they sit on.
ORDER_LAST = ['frontDeltoid', 'rearDeltoid']

# MuscleMap has no glute medius; add one per side, tucked under the glutes so only
# the upper-outer edge shows. Back view is mirrored about x = 1083.5.
def glute_med(cx, cy=662, rx=19, ry=40, rot=-16):
    """An ellipse as a polygon path (so it fits the same [muscle, d] table)."""
    import math
    t = math.radians(rot); pts = []
    for i in range(36):
        a = 2 * math.pi * i / 36
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t)))
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'

def build():
    src = json.load(open(os.path.join(HERE, 'source-musclemap-male.json')))
    out = {}
    for view, table, vb in (('front', FRONT, '40 88 650 1268'), ('back', BACK, '760 88 650 1268')):
        parts = []
        rows = sorted(src[view], key=lambda r: (table.get(r[0]) not in ('',), r[0] in ORDER_LAST))
        for slug, p in rows:
            if slug not in table:
                continue
            for d in p['common'] + p['left'] + p['right']:
                parts.append([table[slug], d])
        if view == 'back':
            # glute medius goes before the glutes so they overlap it
            gi = next(i for i, x in enumerate(parts) if x[0] == 'glutes')
            parts[gi:gi] = [['abductors', glute_med(984)], ['abductors', glute_med(2 * 1083.5 - 984, rot=16)]]
        out[view] = {'vb': vb, 'parts': parts}
    js = json.dumps(out, separators=(',', ':'))
    html = open(HTML).read()
    if '/*BODY:BEGIN*/' not in html:
        sys.exit('index.html has no /*BODY:BEGIN*/ marker')
    html = re.sub(r'/\*BODY:BEGIN\*/.*?/\*BODY:END\*/', lambda _: '/*BODY:BEGIN*/' + js + '/*BODY:END*/', html, flags=re.S)
    open(HTML, 'w').write(html)
    print('front parts', len(out['front']['parts']), 'back parts', len(out['back']['parts']), 'bytes', len(js))

if __name__ == '__main__':
    build()
