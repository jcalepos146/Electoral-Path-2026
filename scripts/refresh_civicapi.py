#!/usr/bin/env python3
"""Refresh the civicAPI-based data files in data/.

Rebuilds, from the latest civicAPI counts:
  data/counties.json       2026 Senate / governor / House votes by county (keeps the 2020 and 2024 presidential columns)
  data/sim_house.json      each House district's margin for the simulator
  data/sim_races.json      each Senate and governor race's margin for the simulator (race calls are left alone)
  data/state_turnout.json  2026 votes cast by state vs. 2024 and 2020
  data/measures.json       statewide ballot measure counts

Race calls (data/senate_races.json, governor_races.json, house.json) are NOT changed: update those by hand from AP calls.
After running, update the national 2026 House totals in assets/app.js (HOUSE_2026 and VOTES_2026); this script prints them.

Usage:  python3 scripts/refresh_civicapi.py            (from the repository root)
civicAPI is free to use with attribution: https://civicapi.org
"""
import collections
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
API = 'https://civicapi.org/api/v2'
UA = {'User-Agent': 'midterms-2026-results (github)'}
TERRITORIES = {'US', 'GU', 'VI', 'MP', 'PR', 'AS'}
COUNTY_TYPES = ('County', 'Parish', 'City', 'Borough')
AK_ALIAS = {'02063': '02261', '02066': '02261'}  # Chugach and Copper River map to the old Valdez-Cordova shape


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('failed: ' + url)


def load(name):
    return json.load(open(DATA / name))


def save(name, obj):
    json.dump(obj, open(DATA / name, 'w'), separators=(',', ':'), ensure_ascii=False)


def pcode(p):
    p = (p or '').lower()
    if p.startswith('democrat') or p in ('dfl', 'democratic-farmer-labor'):
        return 'D'
    if p.startswith('republican'):
        return 'R'
    return 'O'


def main():
    races = get(f'{API}/race/search?startDate=2026-11-03&endDate=2026-11-03&limit=50000')['races']
    want = [r for r in races if r['country'] == 'US' and r['province'] not in TERRITORIES and (
        r['type'] in ('US Senate', 'Governor', 'House of Representatives') or
        (r['election_type'] == 'Statewide' and r['type'] in ('Referendum', 'Proposition', 'Ballot Measure', 'Statewide')))]
    print('races to fetch:', len(want))
    detail = {}
    for i, r in enumerate(want):
        detail[r['id']] = get(f"{API}/race/{r['id']}")
        time.sleep(0.15)
        if i % 100 == 0:
            print('  fetched', i)

    # house.json lists each district's candidates as "Name (P); Name (P)"
    house_wiki = {}
    for h in load('house.json'):
        cands = []
        for part in (h.get('candidates') or '').split('; '):
            m = re.match(r'(.*)\((\w)\)\s*$', part)
            if m:
                cands.append({'name': m.group(1).strip(), 'p': m.group(2)})
        house_wiki[h['seat']] = cands

    def cand_party(c, dist):
        p = pcode(c['party'])
        if p == 'O' and c['party'] in ('Nonpartisan', 'Unaffiliated') and dist in house_wiki:
            last = c['name'].split()[-1].lower()
            for wc in house_wiki[dist]:
                if last in wc['name'].lower():
                    return wc['p'] if wc['p'] in 'DR' else 'O'
        return p

    county = collections.defaultdict(dict)
    house_cty = collections.defaultdict(lambda: {'D': 0, 'R': 0, 'O': 0, 'contested': True})
    state_tot = collections.defaultdict(dict)
    house_dist = {}
    for r in want:
        if r['type'] not in ('US Senate', 'Governor', 'House of Representatives'):
            continue
        d, st = detail[r['id']], r['province']
        k = {'US Senate': 'sen', 'Governor': 'gov', 'House of Representatives': 'house'}[r['type']]
        dist = None
        if k == 'house':
            m = re.search(r'(\d+)', r['district'] or '')
            dist = f'{st}-{int(m.group(1))}' if m else f'{st}-AL'
            if dist not in house_wiki and f'{st}-AL' in house_wiki:
                dist = f'{st}-AL'
        sp = collections.Counter()
        for c in d['candidates']:
            sp[cand_party(c, dist)] += c['votes'] or 0
        tot = sum(sp.values())
        top2 = ''.join(sorted(p for p, _ in sorted(sp.items(), key=lambda x: -x[1])[:2]))
        if k == 'house':
            house_dist[dist] = {'st': st, 'd': sp['D'], 'r': sp['R'], 'total': tot, 'contested': bool(sp['D'] and sp['R'])}
        else:
            state_tot[st][k] = {'total': tot, 'top2': top2, 'cands': d['candidates']}
        for v in (d.get('region_results') or {}).values():
            if v.get('type') not in COUNTY_TYPES or not v.get('fips'):
                continue
            f = AK_ALIAS.get(v['fips'], v['fips'])
            pv = collections.Counter()
            for c in v['candidates']:
                pv[cand_party(c, dist)] += c['votes'] or 0
            if k == 'house':
                h = house_cty[f]
                h['D'] += pv['D']; h['R'] += pv['R']; h['O'] += pv['O']; h['st'] = st
                if not (sp['D'] and sp['R']):
                    h['contested'] = False
            else:
                county[f].setdefault(k, collections.Counter()).update(pv)
                county[f]['st'] = st
    for f, h in house_cty.items():
        county[f]['house'] = collections.Counter({'D': h['D'], 'R': h['R'], 'O': h['O']})
        county[f]['house_contested'] = h['contested']
        county[f]['st'] = h['st']

    # counties.json (presidential columns kept from the current file)
    old = {r['fips']: r for r in load('counties.json')}
    rows = []
    for f in sorted(set(old) | set(county)):
        o, c = old.get(f, {}), county.get(f, {})
        st = o.get('st') or c.get('st')
        r = {k: o.get(k) for k in ('fips', 'county', 'st', 'm24', 'm20', 't24', 't20')}
        r['fips'], r['st'] = f, st
        for k in ('sen', 'gov', 'house'):
            pv = c.get(k)
            if not pv or not sum(pv.values()):
                continue
            t = sum(pv.values())
            r[k + '26_d'] = round(100 * pv['D'] / t, 1)
            r[k + '26_r'] = round(100 * pv['R'] / t, 1)
            r[k + '26_total'] = t
            srt = sorted(pv.items(), key=lambda x: -x[1])
            r[k + '26_lead'] = srt[0][0]
            r[k + '26_lead_margin'] = round(100 * (srt[0][1] - (srt[1][1] if len(srt) > 1 else 0)) / t, 1)
        if 'house' in c and not c.get('house_contested', True):
            r['house26_partial'] = True
        top = None
        for k, lab in (('sen', 'Senate'), ('gov', 'Governor')):
            s = state_tot.get(st, {}).get(k)
            if s and s['top2'] == 'DR' and r.get(k + '26_total'):
                top = (k, lab)
                break
        if not top and r.get('house26_total') and not r.get('house26_partial'):
            top = ('house', 'House')
        if top:
            r['top26_race'] = top[1]
            r['top26_m'] = round(r[top[0] + '26_d'] - r[top[0] + '26_r'], 1)
        t26 = max([r.get(k + '26_total') or 0 for k in ('sen', 'gov', 'house')]) or None
        r['t26'] = t26
        r['t26_vs_24'] = round(100 * t26 / r['t24'], 1) if t26 and r.get('t24') else None
        r['t26_vs_20'] = round(100 * t26 / r['t20'], 1) if t26 and r.get('t20') else None
        rows.append(r)
    save('counties.json', rows)
    print('counties with 2026 votes:', sum(1 for r in rows if r.get('t26')))

    # sim_house.json
    sim_house = load('sim_house.json')
    for h in sim_house:
        c = house_dist.get(h['seat'])
        if c and c['total']:
            h['margin'] = round(100 * (c['d'] - c['r']) / c['total'], 2)
            h['basis'] = 'civicAPI count' + ('' if c['contested'] else ' (uncontested by one party)')
    save('sim_house.json', sim_house)

    # sim_races.json (margins only; calls unchanged)
    sim = load('sim_races.json')
    for r in sim:
        s = state_tot.get(r['st'], {}).get('sen' if r['office'] == 'senate' else 'gov')
        if not s or not s['total']:
            continue
        cands = s['cands']
        if r['st'] == 'AK':
            reps = sum(c['votes'] or 0 for c in cands if c['party'].startswith('Republican'))
            ch = max((c for c in cands if not c['party'].startswith('Republican')), key=lambda c: c['votes'] or 0)
            r['margin'] = round(100 * ((ch['votes'] or 0) - reps) / s['total'], 2)
            continue

        def votes_of(name):
            last = name.split()[-1].lower() if name else '~'
            for c in cands:
                if last in c['name'].lower():
                    return c['votes'] or 0
            return None
        a, b = votes_of(r['chal']), votes_of(r['rep'])
        if a is not None and b is not None:
            r['margin'] = round(100 * (a - b) / s['total'], 2)
    save('sim_races.json', sim)

    # state_turnout.json
    hs = collections.Counter()
    for h in house_dist.values():
        hs[h['st']] += h['total']
    turn = load('state_turnout.json')
    for r in turn:
        s = state_tot.get(r['st'], {})
        opts = [(s[k]['total'], {'sen': 'U.S. Senate', 'gov': 'Governor'}[k]) for k in ('sen', 'gov') if k in s]
        if hs.get(r['st']):
            opts.append((hs[r['st']], 'U.S. House, all districts'))
        if opts:
            v, b = max(opts)
            r['votes26'], r['basis'] = v, b + ' (civicAPI)'
            r['pct_of_24'] = round(100 * v / r['votes24'], 1) if r['votes24'] else None
            r['pct_of_20'] = round(100 * v / r['votes20'], 1) if r['votes20'] else None
    save('state_turnout.json', turn)

    # measures.json (counts by ballot name; descriptions kept from the current file)
    meas = load('measures.json')
    by_name = {(m['st'], m['ballot_name']): m for m in meas if m.get('ballot_name')}
    for r in want:
        if r['type'] in ('US Senate', 'Governor', 'House of Representatives'):
            continue
        d = detail[r['id']]
        yes = sum(c['votes'] or 0 for c in d['candidates'] if re.match(r'^(yes|for|approve)', c['name'].strip().lower()))
        no = sum(c['votes'] or 0 for c in d['candidates'] if re.match(r'^(no|against|reject)', c['name'].strip().lower()))
        m = by_name.get((r['province'], r['election_name']))
        if m and yes + no:
            m.update(yes_votes=yes, no_votes=no, yes_pct=round(100 * yes / (yes + no), 1), no_pct=round(100 * no / (yes + no), 1),
                     count=f"{d['percent_reporting']}% reporting (civicAPI)")
    save('measures.json', meas)

    nat = collections.Counter()
    for h in house_dist.values():
        nat['dem'] += h['d']; nat['rep'] += h['r']; nat['total'] += h['total']
    print('National House totals for assets/app.js (HOUSE_2026 and VOTES_2026):', dict(nat))


if __name__ == '__main__':
    main()
