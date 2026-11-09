/* 2026 midterm results: drawings, calculations and controls. Data comes from data/*.json via assets/dash.js. */
window.EV = (() => {
  const P = {D: 'Democrat', R: 'Republican', I: 'Independent', L: 'Libertarian', G: 'Green', O: 'Other', U: 'Uncalled'};
  const fill = (p) => ({D: 'var(--ev-d)', R: 'var(--ev-r)', I: 'var(--ev-i)', U: 'var(--ev-u)'})[p] || 'var(--ev-o)';
  const ok = (...ids) => ids.every((id) => dash.data(id).status === 'ok');
  const failed = (...ids) => ids.some((id) => dash.data(id).status === 'error');
  const pct = (v) => (v == null || v === '' ? '' : d3.format('.1f')(v) + '%');
  const reset = (el, ids) => {
    el.replaceChildren();
    el.classList.remove('dash-skeleton');
    if (failed(...ids)) {
      const f = document.createElement('div'); f.className = 'fail';
      f.append(document.createElement('i'), 'Failed to load'); el.append(f); return false;
    }
    if (!ok(...ids)) { el.classList.add('dash-skeleton'); return false; }
    return true;
  };
  const tip = (el) => {
    const t = document.createElement('div'); t.className = 'tip'; t.hidden = true; el.append(t);
    return {
      show(ev, title, lines) {
        t.replaceChildren();
        const h = document.createElement('div'); h.className = 't'; h.textContent = title; t.append(h);
        lines.filter((l) => l !== '').forEach((l) => { const d = document.createElement('div'); d.textContent = l; t.append(d); });
        t.hidden = false;
        const [x, y] = d3.pointer(ev, el);
        const w = t.offsetWidth, hgt = t.offsetHeight, W = el.clientWidth;
        t.style.left = Math.max(0, Math.min(W - w, x + 12)) + 'px';
        t.style.top = Math.max(0, y - hgt - 10) + 'px';
      },
      hide() { t.hidden = true; },
    };
  };
  const fmtM = (m) => (Math.abs(m) < 0.05 ? 'Even' : (m > 0 ? 'D+' : 'R+') + d3.format('.1f')(Math.abs(m)));
  return {P, fill, ok, failed, pct, reset, tip, fmtM, houseFilter: 'all', houseQuery: '', vpQ: 'Age', mq: '', mf: 'all',
    cmRace: 'top', cmMeasure: 'margin', trOffice: 'Senate', trMeasure: 'trend'};
})();

/* ---------- calculations ---------- */
dash.calc('senate_balance', {
  inputs: ['senate_races', 'senate_holdovers'],
  fn: (senate_races, senate_holdovers) => {
    const n = (p) => senate_races.filter((r) => r.party === p).length + (senate_holdovers.find((h) => h.party === p)?.seats || 0);
    return [{key: 'D', seats: n('D')}, {key: 'I', seats: n('I')}, {key: 'DC', seats: n('D') + n('I')}, {key: 'R', seats: n('R')}, {key: 'U', seats: n('U')}];
  },
});
dash.calc('house_balance', {
  inputs: ['house'],
  fn: (house) => ['D', 'R', 'U'].map((p) => ({key: p, seats: house.filter((r) => r.party === p).length})),
});
dash.calc('governor_balance', {
  inputs: ['governor_races'],
  fn: (governor_races) => ['D', 'R', 'U'].map((p) => ({key: p, races: governor_races.filter((r) => r.party === p).length})),
});
dash.calc('flips', {
  inputs: ['senate_races', 'house', 'governor_races'],
  fn: (senate_races, house, governor_races) => [['Senate', senate_races], ['House', house], ['Governor', governor_races]].map(([office, rows]) => ({
    office,
    to_d: rows.filter((r) => r.flip === 'Yes' && r.party === 'D').length,
    to_r: rows.filter((r) => r.flip === 'Yes' && r.party === 'R').length,
  })),
});
// 2026 national House vote summed across all districts (civicAPI, Nov. 9, 2026).
dash.calc('national_env', {
  inputs: ['pres_totals'],
  fn: (pres_totals) => {
    const HOUSE_2026 = {dem: 64278885, rep: 49063784, total: 115043169};
    const pct = (y) => Math.round((1000 * (y.dem - y.rep)) / y.total) / 10;
    const nat26 = pct(HOUSE_2026), nat24 = pct(pres_totals.find((r) => r.year === 2024)), nat20 = pct(pres_totals.find((r) => r.year === 2020));
    const r1 = (v) => Math.round(10 * v) / 10;
    return [{key: 'nat24', value: nat24}, {key: 'nat20', value: nat20}, {key: 'nat26', value: nat26}, {key: 'swing', value: r1(nat26 - nat24)}, {key: 'swing20', value: r1(nat26 - nat20)}];
  },
});
dash.calc('state_trends', {
  inputs: ['senate_races', 'senate_candidates', 'governor_races', 'governor_candidates', 'state_turnout', 'national_env'],
  fn: (senate_races, senate_candidates, governor_races, governor_candidates, state_turnout, national_env) => {
    const ne = Object.fromEntries(national_env.map((x) => [x.key, x.value]));
    const p24 = new Map(state_turnout.map((s) => [s.st, s.pres24_margin]));
    const out = [];
    [['Senate', senate_races, senate_candidates], ['Governor', governor_races, governor_candidates]].forEach(([office, races, cands]) => {
      races.forEach((r) => {
        const cs = cands.filter((c) => c.race === r.race && c.pct != null);
        const top = cs.slice().sort((a, b) => b.pct - a.pct).slice(0, 2).map((c) => c.party).sort().join('');
        if (top !== 'DR' || p24.get(r.st) == null) return;
        const sumOf = (p) => cs.filter((c) => c.party === p).reduce((a, c) => a + c.pct, 0);
        const m = Math.round(10 * (sumOf('D') - sumOf('R'))) / 10, pres = p24.get(r.st);
        out.push({race: office + ' · ' + r.race, office, st: r.st, margin26: m, pres24: pres,
          rel_nat: Math.round(10 * (m - ne.nat26)) / 10, trend: Math.round(10 * (m - pres - ne.swing)) / 10});
      });
    });
    return out;
  },
});
// Turnout rates by past vote: each group's share of 2026 voters (Voter Poll) times the 2026 House votes counted
// by Nov. 9 (civicAPI), divided by the group's size then. 2024 eligible population and ballots: UF Election Lab.
dash.calc('sim_base', {
  inputs: ['pres_totals', 'voter_poll'],
  fn: (pres_totals, voter_poll) => {
    const VOTES_2026 = 115043169, VEP_2024 = 244666890, BALLOTS_2024 = 155547700;
    const g = (grp) => voter_poll.find((r) => r.question === '2024 presidential vote' && r.group === grp).share;
    const a = (grp) => voter_poll.find((r) => r.question === 'Donald Trump job approval?' && r.group === grp).share;
    const H = g('Kamala Harris'), T = g('Donald Trump'), O = g('Another candidate'), N = g('Did not vote'), S = H + T + O + N;
    const y24 = pres_totals.find((r) => r.year === 2024), y20 = pres_totals.find((r) => r.year === 2020);
    const row = (key, label, share, prev) => { const v = Math.round((VOTES_2026 * share) / S); return {key, label, prev_voters: prev, voters_2026: v, value: Math.round((1000 * v) / prev) / 10}; };
    return [
      row('trump24', '2024 Trump voters', T, y24.rep),
      row('harris24', '2024 Harris voters', H, y24.dem),
      row('new24', 'Eligible people who skipped 2024', N, VEP_2024 - BALLOTS_2024),
      row('trump20', '2020 Trump voters (assumes the 2024 mix)', T, y20.rep),
      row('biden20', '2020 Biden voters (assumes the 2024 mix)', H, y20.dem),
      {key: 'approval', label: 'Trump approval among 2026 voters', prev_voters: null, voters_2026: null, value: a('Strongly approve') + a('Somewhat approve')},
    ];
  },
});

/* ---------- headline numbers and overview ---------- */
dash.draw('n', (el) => {
  const id = el.dataset.source, data = dash.data(id);
  if (data.status !== 'ok') { el.textContent = '—'; el.classList.toggle('dash-skeleton', data.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const [k, ...rest] = el.dataset.where.split('='), v = rest.join('=');
  const row = data.data.find((r) => String(r[k]) === v);
  const val = row ? row[el.dataset.field] : null;
  const fm = el.dataset.fmt;
  el.textContent = val == null ? '—' : fm === 'pct' ? val + '%' : fm === 'margin' ? EV.fmtM(val) : fm === 'pts' ? d3.format('.1f')(val) + ' points' : d3.format(',')(val);
});

dash.draw('seatbar', (el) => {
  const kind = el.dataset.bar, id = el.dataset.source;
  if (!EV.reset(el, [id])) return;
  const rows = dash.data(id).data, get = (k) => (rows.find((r) => r.key === k) || {})[kind === 'governor' ? 'races' : 'seats'] || 0;
  const segs = kind === 'senate' ? [['D', get('D')], ['I', get('I')], ['U', get('U')], ['R', get('R')]] : [['D', get('D')], ['U', get('U')], ['R', get('R')]];
  const total = d3.sum(segs, (s) => s[1]);
  const majority = kind === 'senate' ? 51 : kind === 'house' ? 218 : null;
  const W = Math.max(200, el.clientWidth), H = majority ? 44 : 26;
  const x = d3.scaleLinear([0, total], [0, W]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
  svg.append('defs').append('pattern').attr('id', 'ev-hatch-' + kind).attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
    .append('rect').attr('width', 2).attr('height', 5).style('fill', 'var(--ev-u)');
  let acc = 0;
  const t = EV.tip(el);
  segs.forEach(([p, n]) => {
    svg.append('rect').attr('x', x(acc)).attr('y', 4).attr('width', Math.max(0, x(n) - x(0) - (n ? 1 : 0))).attr('height', 18)
      .style('fill', p === 'U' ? `url(#ev-hatch-${kind})` : EV.fill(p))
      .on('mousemove', (ev) => t.show(ev, EV.P[p], [d3.format(',')(n) + (kind === 'governor' ? ' races' : ' seats')]))
      .on('mouseleave', () => t.hide());
    acc += n;
  });
  if (majority) {
    const mx = x(majority);
    svg.append('line').attr('x1', mx).attr('x2', mx).attr('y1', 0).attr('y2', 26).style('stroke', 'var(--color-fg)').style('stroke-width', 1.5);
    const lab = svg.append('text').attr('x', mx).attr('y', 40).attr('text-anchor', 'middle').style('fill', 'var(--color-fg-muted)').style('font-size', '11px').text(majority + ' for majority');
    if (mx + lab.node().getComputedTextLength() / 2 > W) lab.attr('text-anchor', 'end').attr('x', W);
  }
});

dash.draw('flips-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('flips')) return;
  dash.data('flips').data.forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = r.office;
    const a = tr.insertCell(); a.className = 'num'; a.textContent = r.to_d;
    const b = tr.insertCell(); b.className = 'num'; b.textContent = r.to_r;
  });
});

/* ---------- Senate, House, governor results ---------- */
dash.draw('tilemap', (el) => {
  const rid = el.dataset.races, cid = el.dataset.cands;
  if (!EV.reset(el, [rid, cid, 'state_tiles'])) return;
  const races = dash.data(rid).data, cands = dash.data(cid).data, tiles = dash.data('state_tiles').data;
  const byState = d3.group(races, (r) => r.st);
  const S = 50, W = 12 * S, H = 8 * S;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
  svg.append('defs').append('pattern').attr('id', 'ev-hatch-' + rid).attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
    .append('rect').attr('width', 2.5).attr('height', 6).style('fill', 'var(--ev-u)');
  const t = EV.tip(el);
  tiles.forEach((s) => {
    const rs = byState.get(s.st) || [];
    const g = svg.append('g').attr('transform', `translate(${s.col * S + 2},${s.row * S + 2})`);
    const n = rs.length || 1;
    rs.forEach((r, i) => {
      g.append('rect').attr('y', (i * (S - 4)) / n).attr('width', S - 4).attr('height', (S - 4) / n - (n > 1 && i === 0 ? 1 : 0)).attr('rx', 3)
        .style('fill', r.party === 'U' ? `url(#ev-hatch-${rid})` : EV.fill(r.party))
        .style('stroke', r.flip === 'Yes' ? 'var(--color-fg)' : 'none').style('stroke-width', 2.5);
    });
    if (!rs.length) g.append('rect').attr('width', S - 4).attr('height', S - 4).attr('rx', 3).style('fill', 'var(--color-bg)').style('stroke', 'var(--color-border-line)');
    const dark = rs.length && rs.every((r) => r.party !== 'U');
    g.append('text').attr('x', (S - 4) / 2).attr('y', (S - 4) / 2 + 5).attr('text-anchor', 'middle').style('font-size', '14px').style('font-weight', 600)
      .style('fill', dark ? '#fff' : 'var(--color-fg-muted)').style('pointer-events', 'none').text(s.st);
    g.append('rect').attr('width', S - 4).attr('height', S - 4).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        if (!rs.length) return t.show(ev, s.state, ['No race this year']);
        const lines = [];
        rs.forEach((r) => {
          if (rs.length > 1) lines.push(r.race + ':');
          cands.filter((c) => c.race === r.race).slice(0, 4).forEach((c) => lines.push(`${c.winner === 'Yes' ? '✓ ' : ''}${c.candidate} (${c.party})${c.pct != null ? '  ' + EV.pct(c.pct) : ''}`));
          lines.push(r.status === 'Called' ? (r.flip === 'Yes' ? 'Called · changed party' : 'Called') : 'Uncalled');
          if (r.note) lines.push(r.note);
        });
        t.show(ev, s.state, lines);
      })
      .on('mouseleave', () => t.hide());
  });
});

dash.draw('housemap', (el) => {
  if (!EV.reset(el, ['house', 'state_tiles'])) return;
  const house = dash.data('house').data, tiles = dash.data('state_tiles').data;
  const order = {D: 0, I: 1, O: 2, U: 3, R: 4};
  const byState = d3.group(house, (r) => r.st);
  const S = 50, W = 12 * S, H = 8 * S;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
  const t = EV.tip(el);
  tiles.forEach((s) => {
    const seats = (byState.get(s.st) || []).slice().sort((a, b) => order[a.party] - order[b.party]);
    const g = svg.append('g').attr('transform', `translate(${s.col * S + 2},${s.row * S + 2})`);
    g.append('rect').attr('width', S - 4).attr('height', S - 4).attr('rx', 3).style('fill', 'var(--color-bg)').style('stroke', 'var(--color-border-line)');
    g.append('text').attr('x', 3).attr('y', 10).style('font-size', '9px').style('font-weight', 600).style('fill', 'var(--color-fg-muted)').text(s.st);
    const n = seats.length, aw = S - 10, ah = S - 18;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * aw) / ah))), rows = Math.ceil(n / cols);
    const side = Math.min(aw / cols, ah / rows);
    seats.forEach((r, i) => {
      g.append('rect').attr('x', 3 + (i % cols) * side).attr('y', 13 + Math.floor(i / cols) * side)
        .attr('width', Math.max(1, side - 0.8)).attr('height', Math.max(1, side - 0.8)).attr('rx', 0.6)
        .style('fill', EV.fill(r.party))
        .style('stroke', r.flip === 'Yes' ? 'var(--color-fg)' : 'none').style('stroke-width', 0.9);
    });
    g.append('rect').attr('width', S - 4).attr('height', S - 4).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const c = d3.rollup(seats, (v) => v.length, (r) => r.party);
        const flips = seats.filter((r) => r.flip === 'Yes').map((r) => `${r.seat} → ${r.party}`);
        const lines = [`Democrats ${c.get('D') || 0} · Republicans ${c.get('R') || 0}${c.get('U') ? ' · Uncalled ' + c.get('U') : ''}`];
        if (flips.length) lines.push('Changed party: ' + flips.join(', '));
        const un = seats.filter((r) => r.party === 'U').map((r) => r.seat);
        if (un.length) lines.push('Uncalled: ' + un.join(', '));
        t.show(ev, s.state, lines);
      })
      .on('mouseleave', () => t.hide());
  });
});

dash.draw('race-table', (tb) => {
  const id = tb.dataset.races;
  tb.replaceChildren();
  if (!EV.ok(id)) return;
  dash.data(id).data.forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = r.race;
    const lead = tr.insertCell();
    if (r.top) { const c = document.createElement('i'); c.className = 'dot ' + r.top_party; lead.append(c); }
    lead.append(r.top || '');
    const a = tr.insertCell(); a.className = 'num'; a.textContent = EV.pct(r.top_pct);
    const s = tr.insertCell(); s.className = 'hide-narrow';
    if (r.second) { const c = document.createElement('i'); c.className = 'dot ' + r.second_party; s.append(c); }
    s.append(r.second || '');
    const b = tr.insertCell(); b.className = 'num hide-narrow'; b.textContent = EV.pct(r.second_pct);
    const m = tr.insertCell(); m.className = 'num'; m.textContent = r.margin == null ? '' : d3.format('.1f')(r.margin);
    tr.insertCell().textContent = r.status;
    tr.insertCell().textContent = r.flip;
    const n = tr.insertCell(); n.className = 'hide-narrow muted'; n.textContent = r.note;
  });
});

dash.draw('house-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('house')) return;
  const q = EV.houseQuery.trim().toLowerCase(), f = EV.houseFilter;
  dash.data('house').data
    .filter((r) => f === 'all' || (f === 'flip' && r.flip === 'Yes') || (f === 'uncalled' && r.status === 'Uncalled'))
    .filter((r) => !q || [r.seat, r.state, r.winner, r.candidates].join(' ').toLowerCase().includes(q))
    .forEach((r) => {
      const tr = tb.insertRow();
      tr.insertCell().textContent = r.seat;
      const p = tr.insertCell(); const c = document.createElement('span'); c.className = 'chip ' + r.party; c.textContent = r.party; p.append(c);
      tr.insertCell().textContent = r.winner;
      tr.insertCell().textContent = r.status;
      tr.insertCell().textContent = r.flip;
      const cd = tr.insertCell(); cd.className = 'hide-narrow muted'; cd.textContent = r.candidates;
      const n = tr.insertCell(); n.className = 'hide-narrow muted'; n.textContent = r.note;
    });
});

/* ---------- voter poll ---------- */
const vpRows = (el, q, shareLabel) => {
  const rows = dash.data('voter_poll').data.filter((r) => r.question === q).sort((a, b) => a.order - b.order);
  const t = EV.tip(el);
  rows.forEach((r) => {
    const row = document.createElement('div'); row.className = 'vprow';
    const lab = document.createElement('div'); lab.textContent = r.group;
    const bar = document.createElement('div'); bar.className = 'bar';
    const bd = document.createElement('div'); bd.className = 'bd'; bd.style.width = r.dem + '%'; bd.textContent = r.dem + '%';
    const br = document.createElement('div'); br.className = 'br'; br.style.width = r.rep + '%'; br.textContent = r.rep + '%';
    bar.append(bd, br);
    const sh = document.createElement('div'); sh.className = 'sh'; sh.textContent = r.share + '%';
    row.append(lab, bar, sh);
    row.addEventListener('mousemove', (ev) => t.show(ev, r.group, [`Democratic ${r.dem}% · Republican ${r.rep}%`, `${r.share}% of ${shareLabel}`]));
    row.addEventListener('mouseleave', () => t.hide());
    el.append(row);
  });
};
dash.draw('vp-q', (sel) => {
  if (!EV.ok('voter_poll')) { sel.replaceChildren(); return; }
  const qs = [...new Set(dash.data('voter_poll').data.map((r) => r.question).filter((q) => q !== 'Overall'))];
  sel.replaceChildren(...qs.map((q) => new Option(q, q)));
  sel.value = EV.vpQ;
  sel.onchange = () => { EV.vpQ = sel.value; dash.draw('vp-chart'); };
});
dash.draw('vp-chart', (el) => { if (EV.reset(el, ['voter_poll'])) vpRows(el, EV.vpQ, 'all voters'); });
dash.draw('vp-fixed', (el) => { if (EV.reset(el, ['voter_poll'])) vpRows(el, el.dataset.q, '2026 voters'); });

/* ---------- county map ---------- */
EV.topo = (() => {
  let cache = null;
  return (topo) => {
    if (cache && cache.src === topo) return cache;
    const t = topo.transform;
    const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map((p) => { if (!t) return p; x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; }); });
    const ring = (ids) => { const out = []; ids.forEach((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out.push(...(k ? a.slice(1) : a)); }); return out; };
    const feat = (g) => ({type: 'Feature', id: g.id, properties: g.properties || {}, geometry: g.type === 'Polygon' ? {type: 'Polygon', coordinates: g.arcs.map(ring)} : g.type === 'MultiPolygon' ? {type: 'MultiPolygon', coordinates: g.arcs.map((p) => p.map(ring))} : null});
    cache = {src: topo, counties: topo.objects.counties.geometries.map(feat), states: topo.objects.states.geometries.map(feat), bbox: topo.bbox};
    return cache;
  };
})();

dash.draw('countymap2', (el) => {
  if (!EV.reset(el, ['counties', 'county_shapes', 'national_env'])) return;
  const geo = EV.topo(dash.data('county_shapes').data);
  const rows = new Map(dash.data('counties').data.map((r) => [r.fips, r]));
  const NE = Object.fromEntries(dash.data('national_env').data.map((x) => [x.key, x.value]));
  const race = EV.cmRace, M = EV.cmMeasure, cs = getComputedStyle(el);
  const cD = cs.getPropertyValue('--ev-d').trim(), cR = cs.getPropertyValue('--ev-r').trim(), cI = cs.getPropertyValue('--ev-i').trim(), cT = cs.getPropertyValue('--ev-t').trim();
  const mid0 = cs.getPropertyValue('--color-panel').trim(), cMid = d3.color(mid0) ? mid0 : '#efeee9';
  const RACE = {sen: 'Senate', gov: 'Governor', house: 'House'};
  const m26of = (r, k) => {
    if (k === 'top') return r.top26_m ?? null;
    if (k === 'house' && r.house26_partial) return null;
    const d = r[k + '26_d'], rp = r[k + '26_r'];
    return d && rp ? d - rp : null;
  };
  const tot26 = (r) => (race === 'top' ? r.t26 : r[race + '26_total']);
  const val = (r) => {
    if (!r) return null;
    const m = m26of(r, race);
    switch (M) {
      case 'margin': return m;
      case 'swing24': return m == null || r.m24 == null ? null : m - r.m24;
      case 'swing20': return m == null || r.m20 == null ? null : m - r.m20;
      case 'trend24': return m == null || r.m24 == null ? null : m - r.m24 - NE.swing;
      case 'trend20': return m == null || r.m20 == null ? null : m - r.m20 - NE.swing20;
      case 'turn24': { const t = tot26(r); return t && r.t24 ? (100 * t) / r.t24 : null; }
      case 'turn20': { const t = tot26(r); return t && r.t20 ? (100 * t) / r.t20 : null; }
      case 'p24': return r.m24 ?? null;
      case 'p20': return r.m20 ?? null;
    }
    return null;
  };
  const kind = M.startsWith('turn') ? 'turn' : M.startsWith('swing') || M.startsWith('trend') ? 'shift' : 'margin';
  const LIM = kind === 'shift' ? 30 : 60, TLO = 40, THI = 110;
  const div = d3.scaleLinear([-LIM, 0, LIM], [cR, cMid, cD]).clamp(true), seq = d3.scaleLinear([TLO, THI], [cMid, cT]).clamp(true);
  const color = (r) => {
    if (r && M === 'margin' && race !== 'top' && r[race + '26_lead'] === 'O') return d3.interpolateRgb(cMid, cI)(Math.min(1, 0.3 + r[race + '26_lead_margin'] / 60));
    const v = val(r);
    if (v == null) return 'var(--ev-none)';
    return kind === 'turn' ? seq(v) : div(v);
  };
  const [x0, y0, x1, y1] = geo.bbox, W = x1 - x0, H = y1 - y0 + 46;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `${x0} ${y0} ${W} ${H}`).attr('role', 'img');
  const path = d3.geoPath(), t = EV.tip(el);
  const sh = (v) => (v == null ? 'n/a' : Math.abs(v) < 0.05 ? 'no change' : `${v > 0 ? 'D' : 'R'} ${d3.format('.1f')(Math.abs(v))}`);
  svg.append('g').selectAll('path').data(geo.counties).join('path').attr('d', path)
    .style('fill', (f) => color(rows.get(f.id))).style('stroke', 'var(--color-panel)').style('stroke-width', 0.25)
    .on('mousemove', (ev, f) => {
      const r = rows.get(f.id);
      if (!r) return t.show(ev, 'County ' + f.id, ['No results in the sources']);
      const lines = [];
      ['sen', 'gov', 'house'].forEach((k) => {
        if (!r[k + '26_total']) return;
        const m = m26of(r, k);
        const lead = r[k + '26_lead'] === 'O' ? `Other+${d3.format('.1f')(r[k + '26_lead_margin'])}` : m == null ? 'one party only' : EV.fmtM(m);
        lines.push(`2026 ${RACE[k]}${k === 'house' ? ' (combined)' : ''}: ${lead}`);
      });
      lines.push(`2024 president: ${r.m24 == null ? 'n/a' : EV.fmtM(r.m24)} · 2020: ${r.m20 == null ? 'n/a' : EV.fmtM(r.m20)}`);
      if (r.top26_m != null) {
        lines.push(`Top race (${r.top26_race}) swing from 2024: ${sh(r.m24 == null ? null : r.top26_m - r.m24)}`);
        lines.push(`Trend vs. nation since 2024: ${sh(r.m24 == null ? null : r.top26_m - r.m24 - NE.swing)}`);
      }
      if (r.t26) lines.push(`2026 votes: ${d3.format(',')(r.t26)}${r.t26_vs_24 ? ` (${r.t26_vs_24}% of 2024)` : ''}`);
      t.show(ev, `${r.county || 'County ' + f.id}, ${r.st}`, lines);
    })
    .on('mouseleave', () => t.hide());
  svg.append('g').selectAll('path').data(geo.states).join('path').attr('d', path).style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', 0.7).style('pointer-events', 'none');
  const lg = svg.append('g').attr('transform', `translate(${x0 + W / 2 - 190},${y1 + 12})`);
  const grad = svg.append('defs').append('linearGradient').attr('id', 'cm2-grad');
  (kind === 'turn' ? [[0, seq(TLO)], [1, seq(THI)]] : [[0, cR], [0.5, cMid], [1, cD]]).forEach(([o, c]) => grad.append('stop').attr('offset', o).attr('stop-color', c));
  lg.append('rect').attr('width', 300).attr('height', 10).attr('rx', 2).style('fill', 'url(#cm2-grad)').style('stroke', 'var(--color-border-line)');
  const labs = kind === 'turn' ? [[0, 'start', TLO + '% or less'], [300, 'end', THI + '% or more']]
    : kind === 'shift' ? [[0, 'start', `R ${LIM}+`], [150, 'middle', M.startsWith('trend') ? 'Same as nation' : 'No change'], [300, 'end', `D ${LIM}+`]]
    : [[0, 'start', 'R+' + LIM], [150, 'middle', 'Even'], [300, 'end', 'D+' + LIM]];
  labs.forEach(([x, a, s]) => lg.append('text').attr('x', x).attr('y', 26).attr('text-anchor', a).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text(s));
  lg.append('rect').attr('x', 320).attr('width', 10).attr('height', 10).style('fill', 'var(--ev-none)');
  lg.append('text').attr('x', 334).attr('y', 9).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text('No data');
});

dash.draw('trendmap', (el) => {
  if (!EV.reset(el, ['state_trends', 'state_tiles'])) return;
  const rows = dash.data('state_trends').data.filter((r) => r.office === EV.trOffice), tiles = dash.data('state_tiles').data;
  const K = EV.trMeasure, LIMS = 20;
  const cs = getComputedStyle(el), mid0 = cs.getPropertyValue('--color-panel').trim(), mid = d3.color(mid0) ? mid0 : '#efeee9';
  const col = d3.scaleLinear([-LIMS, 0, LIMS], [cs.getPropertyValue('--ev-r').trim(), mid, cs.getPropertyValue('--ev-d').trim()]).clamp(true);
  const by = d3.group(rows, (r) => r.st), S = 50;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${12 * S} ${8 * S + 40}`).attr('role', 'img');
  const t = EV.tip(el);
  const lab = (v) => (Math.abs(v) < 0.05 ? 'Same as nation' : `${v > 0 ? 'D' : 'R'} ${d3.format('.1f')(Math.abs(v))} vs. nation`);
  tiles.forEach((s) => {
    const rs = by.get(s.st) || [];
    const gg = svg.append('g').attr('transform', `translate(${s.col * S + 2},${s.row * S + 2})`);
    if (!rs.length) gg.append('rect').attr('width', S - 4).attr('height', S - 4).attr('rx', 3).style('fill', 'var(--color-bg)').style('stroke', 'var(--color-border-line)');
    rs.forEach((r, i) => {
      const h = (S - 4) / rs.length;
      gg.append('rect').attr('y', i * h).attr('width', S - 4).attr('height', h - (rs.length > 1 && i === 0 ? 1 : 0)).attr('rx', 3).style('fill', col(r[K]));
    });
    gg.append('text').attr('x', (S - 4) / 2).attr('y', (S - 4) / 2 + 5).attr('text-anchor', 'middle').style('font-size', '14px').style('font-weight', 600)
      .style('fill', rs.length && rs.every((r) => Math.abs(r[K]) > 12) ? '#fff' : 'var(--color-fg)').style('pointer-events', 'none').text(s.st);
    gg.append('rect').attr('width', S - 4).attr('height', S - 4).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        if (!rs.length) return t.show(ev, s.state, ['No two-party count for this office']);
        const lines = [];
        rs.forEach((r) => {
          if (rs.length > 1) lines.push(r.race);
          lines.push(`2026 margin ${EV.fmtM(r.margin26)} · 2024 president ${EV.fmtM(r.pres24)}`);
          lines.push('Vs. national environment: ' + lab(r.rel_nat));
          lines.push('Trend since 2024: ' + lab(r.trend));
        });
        t.show(ev, s.state, lines);
      })
      .on('mouseleave', () => t.hide());
  });
  const grad = svg.append('defs').append('linearGradient').attr('id', 'tr-grad');
  [[0, col(-LIMS)], [0.5, mid], [1, col(LIMS)]].forEach(([o, c]) => grad.append('stop').attr('offset', o).attr('stop-color', c));
  const lg = svg.append('g').attr('transform', `translate(${6 * S - 150},${8 * S + 6})`);
  lg.append('rect').attr('width', 300).attr('height', 10).attr('rx', 2).style('fill', 'url(#tr-grad)').style('stroke', 'var(--color-border-line)');
  [[0, 'start', `R ${LIMS}+ vs. nation`], [150, 'middle', 'Same as nation'], [300, 'end', `D ${LIMS}+ vs. nation`]].forEach(([x, a, s]) => lg.append('text').attr('x', x).attr('y', 26).attr('text-anchor', a).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text(s));
});

dash.draw('trend-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('state_trends')) return;
  const f = (v) => (v == null ? '' : (v > 0 ? 'D+' : v < 0 ? 'R+' : '') + d3.format('.1f')(Math.abs(v)));
  dash.data('state_trends').data.filter((r) => r.office === EV.trOffice).slice().sort((a, b) => b[EV.trMeasure] - a[EV.trMeasure]).forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = r.race;
    ['margin26', 'pres24', 'rel_nat', 'trend'].forEach((k) => { const c = tr.insertCell(); c.className = 'num'; c.textContent = f(r[k]); });
  });
});

/* ---------- ballot measures and turnout ---------- */
dash.draw('measures-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('measures')) return;
  const q = EV.mq.trim().toLowerCase(), f = EV.mf;
  dash.data('measures').data
    .filter((r) => f === 'all' || r.yes_votes != null)
    .filter((r) => !q || [r.state, r.ballot_name, r.measure, r.description].join(' ').toLowerCase().includes(q))
    .forEach((r) => {
      const tr = tb.insertRow();
      tr.insertCell().textContent = r.state;
      tr.insertCell().textContent = r.ballot_name;
      const m = tr.insertCell(); m.className = 'hide-narrow'; m.textContent = r.measure;
      const y = tr.insertCell(); y.className = 'num'; y.textContent = EV.pct(r.yes_pct);
      if (r.yes_pct != null) y.style.background = `linear-gradient(to left, var(--ev-yes) ${r.yes_pct}%, transparent ${r.yes_pct}%)`;
      const n = tr.insertCell(); n.className = 'num'; n.textContent = EV.pct(r.no_pct);
      tr.insertCell().textContent = r.count;
      const d = tr.insertCell(); d.className = 'hide-narrow muted'; d.textContent = r.description;
    });
});

dash.draw('rates-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('sim_base')) return;
  const f = d3.format(',');
  dash.data('sim_base').data.filter((r) => r.key !== 'approval').forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = r.label;
    const a = tr.insertCell(); a.className = 'num'; a.textContent = f(r.prev_voters);
    const b = tr.insertCell(); b.className = 'num'; b.textContent = f(r.voters_2026);
    const c = tr.insertCell(); c.className = 'num'; c.textContent = r.value + '%';
  });
});

dash.draw('turnout-chart', (el) => {
  if (!EV.reset(el, ['state_turnout'])) return;
  const rows = dash.data('state_turnout').data.filter((r) => r.pct_of_24 != null).sort((a, b) => b.pct_of_24 - a.pct_of_24);
  const REF = 100, rh = 16, W = Math.max(280, el.clientWidth), lm = 34, rm = 46, H = rows.length * rh + 24;
  const max = Math.max(REF, d3.max(rows, (r) => Math.max(r.pct_of_24, r.pct_of_20 || 0)));
  const x = d3.scaleLinear([0, max], [lm, W - rm]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const t = EV.tip(el);
  rows.forEach((r, i) => {
    const y = i * rh + 4;
    svg.append('text').attr('x', 0).attr('y', y + 10).style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text(r.st);
    svg.append('rect').attr('x', lm).attr('y', y + 2).attr('height', rh - 5).attr('width', Math.max(0, x(r.pct_of_24) - lm)).attr('rx', 2).style('fill', 'var(--ev-t)');
    svg.append('text').attr('x', x(r.pct_of_24) + 4).attr('y', y + 10).style('font-size', '10px').style('fill', 'var(--color-fg-muted)').text(r.pct_of_24 + '%');
    if (r.pct_of_20 != null) svg.append('circle').attr('cx', x(r.pct_of_20)).attr('cy', y + rh / 2 - 1).attr('r', 3).style('fill', 'var(--color-fg)');
    svg.append('rect').attr('x', 0).attr('y', y).attr('width', W).attr('height', rh).style('fill', 'transparent')
      .on('mousemove', (ev) => t.show(ev, r.state, [`2026: ${d3.format(',')(r.votes26)} votes (${r.basis})`, `${r.pct_of_24}% of 2024 (${d3.format(',')(r.votes24)})`, r.pct_of_20 != null ? `${r.pct_of_20}% of 2020 (${d3.format(',')(r.votes20)})` : '']))
      .on('mouseleave', () => t.hide());
  });
  svg.append('line').attr('x1', x(REF)).attr('x2', x(REF)).attr('y1', 0).attr('y2', H - 18).style('stroke', 'var(--color-fg)').style('stroke-dasharray', '3 3');
  svg.append('text').attr('x', x(REF)).attr('y', H - 4).attr('text-anchor', 'middle').style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text('Same as presidential year');
});

dash.draw('turnout-table', (tb) => {
  tb.replaceChildren();
  if (!EV.ok('state_turnout')) return;
  const f = d3.format(',');
  dash.data('state_turnout').data.forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = r.st;
    [['votes26', f], ['votes24', f], ['votes20', f], ['pct_of_24', EV.pct], ['pct_of_20', EV.pct]].forEach(([k, fm]) => { const c = tr.insertCell(); c.className = 'num'; c.textContent = r[k] == null ? '' : fm(r[k]); });
    const b = tr.insertCell(); b.className = 'hide-narrow muted'; b.textContent = r.basis;
  });
});

/* ---------- simulator ---------- */
EV.SIMDATA = ['sim_races', 'sim_house', 'sim_states', 'senate_holdovers', 'voter_poll', 'pres_totals', 'sim_base'];
EV.simS = null;
EV.simDefaults = () => {
  const B = Object.fromEntries(dash.data('sim_base').data.map((r) => [r.key, r.value]));
  return {env: 0, appr: B.approval, year: 24, tr: B.trump24, hd: B.harris24, nv: B.new24, B};
};
EV.simRun = (S) => {
  const poll = dash.data('voter_poll').data, B = S.B;
  const g = (q, grp) => poll.find((r) => r.question === q && r.group === grp);
  const G = {H: g('2024 presidential vote', 'Kamala Harris'), T: g('2024 presidential vote', 'Donald Trump'), O: g('2024 presidential vote', 'Another candidate'), N: g('2024 presidential vote', 'Did not vote')};
  const sa = g('Donald Trump job approval?', 'Somewhat approve'), sd = g('Donald Trump job approval?', 'Somewhat disapprove'), ov = g('Overall', 'Total vote');
  const per = ((sa.dem - sa.rep) - (sd.dem - sd.rep)) / 100;
  const states = dash.data('sim_states').data, stMap = new Map(states.map((s) => [s.st, s]));
  const yr = dash.data('pres_totals').data.find((r) => r.year === (S.year === 24 ? 2024 : 2020));
  const natT = yr.rep / (yr.dem + yr.rep);
  const comp = (st) => {
    const t = stMap.get(st)?.['trump' + S.year] ?? natT;
    const wT = (G.T.share * t) / natT, wH = (G.H.share * (1 - t)) / (1 - natT), wO = G.O.share, wN = G.N.share, s = wT + wH + wO + wN;
    return {T: wT / s, H: wH / s, O: wO / s, N: wN / s};
  };
  const marg = (c, m) => { let n = 0, d = 0; for (const k of ['T', 'H', 'O', 'N']) { const w = c[k] * m[k]; n += w * (G[k].dem - G[k].rep); d += w; } return d ? n / d : 0; };
  const baseT = S.year === 24 ? B.trump24 : B.trump20, baseH = S.year === 24 ? B.harris24 : B.biden20;
  const mult = {T: S.tr / baseT, H: S.hd / baseH, O: 1, N: S.nv / B.new24}, one = {T: 1, H: 1, O: 1, N: 1};
  const shift = new Map(states.map((s) => { const c = comp(s.st); return [s.st, marg(c, mult) - marg(c, one)]; }));
  const common = S.env + (S.appr - B.approval) * per;
  const run = (rows, sideOf, isCalled) => rows.map((r) => {
    const m = r.margin + common + (shift.get(r.st) ?? 0), called = isCalled(r);
    const actualSide = called ? r.actual : (r.margin > 0 ? sideOf(r) : 'R'), side = m > 0 ? sideOf(r) : 'R';
    return {...r, m, side, actualSide, called, changed: side !== actualSide};
  });
  const races = run(dash.data('sim_races').data, (r) => (r.chal_p === 'I' ? 'I' : 'D'), (r) => r.called);
  const house = run(dash.data('sim_house').data.map((h) => ({...h, race: h.seat, office: 'house'})), () => 'D', (h) => h.actual !== 'U');
  const natC = {T: G.T.share, H: G.H.share, O: G.O.share, N: G.N.share};
  const nat = (ov.dem - ov.rep) + common + (marg(natC, mult) - marg(natC, one));
  const hold = Object.fromEntries(dash.data('senate_holdovers').data.map((r) => [r.party, r.seats]));
  const sen = races.filter((r) => r.office === 'senate'), gov = races.filter((r) => r.office === 'governor');
  const cnt = (rows, p) => rows.filter((r) => r.side === p).length;
  return {races, house, sen, gov, nat, actualNat: ov.dem - ov.rep,
    sD: (hold.D || 0) + (hold.I || 0) + cnt(sen, 'D') + cnt(sen, 'I'), sR: (hold.R || 0) + cnt(sen, 'R'),
    hD: cnt(house, 'D'), hR: house.length - cnt(house, 'D'), gD: cnt(gov, 'D'), gI: cnt(gov, 'I'), gR: cnt(gov, 'R')};
};
EV.sim = () => {
  if (!EV.ok(...EV.SIMDATA)) return null;
  if (!EV.simS) EV.simS = EV.simDefaults();
  const key = JSON.stringify({...EV.simS, B: 0});
  if (EV._simKey !== key) { EV._simRes = EV.simRun(EV.simS); EV._simKey = key; }
  if (!EV._simBase) EV._simBase = EV.simRun(EV.simDefaults());
  return {R: EV._simRes, base: EV._simBase};
};
EV.simRedraw = () => ['sim-val', 'sim-n', 'sim-verdict', 'sim-bar', 'sim-map', 'sim-housemap', 'sim-flips', 'sim-nat'].forEach((n) => dash.draw(n));
EV.signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);

dash.draw('sim-val', (el) => {
  const res = EV.sim(), k = el.dataset.k;
  if (!res) { el.textContent = '—'; return; }
  const v = EV.simS[k];
  el.textContent = k === 'env' ? (v === 0 ? 'As voted' : (v > 0 ? 'D +' : 'R +') + d3.format('.1f')(Math.abs(v))) : d3.format('.1f')(v).replace(/\.0$/, '') + '%';
  document.querySelectorAll('.ev .sim-in[data-k="' + k + '"]').forEach((inp) => { if (document.activeElement !== inp) inp.value = v; });
});
dash.draw('sim-n', (el) => {
  const res = EV.sim();
  if (!res) { el.textContent = '—'; return; }
  const {R, base} = res, k = el.dataset.k;
  const delta = {sDelta: R.sD - base.sD, hDelta: R.hD - base.hD, gDelta: R.gD - base.gD};
  el.textContent = k in delta ? EV.signed(delta[k]) : String(R[k]);
});
dash.draw('sim-verdict', (el) => {
  const res = EV.sim(), o = el.dataset.office;
  let key = null;
  if (res) key = o === 'senate' ? (res.R.sD >= 51 ? 'senate-D' : res.R.sD === 50 ? 'senate-T' : 'senate-R') : (res.R.hD >= 218 ? 'house-D' : 'house-R');
  document.querySelectorAll('.ev [data-v^="' + o + '-"]').forEach((v) => { v.hidden = v.dataset.v !== key; });
});
dash.draw('sim-bar', (el) => {
  el.replaceChildren();
  const res = EV.sim();
  if (!res) return;
  const R = res.R, o = el.dataset.office;
  const parts = o === 'senate' ? [[R.sD, 'var(--ev-d)'], [R.sR, 'var(--ev-r)']] : o === 'house' ? [[R.hD, 'var(--ev-d)'], [R.hR, 'var(--ev-r)']] : [[R.gD, 'var(--ev-d)'], [R.gI, 'var(--ev-i)'], [R.gR, 'var(--ev-r)']];
  const line = o === 'senate' ? 51 : o === 'house' ? 218 : null;
  const total = d3.sum(parts, (p) => p[0]), W = Math.max(200, el.clientWidth), H = line ? 40 : 24;
  const x = d3.scaleLinear([0, total], [0, W]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  let acc = 0;
  parts.forEach(([n, c]) => { svg.append('rect').attr('x', x(acc)).attr('y', 4).attr('height', 16).attr('width', Math.max(0, x(n) - x(0) - (n ? 1 : 0))).style('fill', c); acc += n; });
  if (line) {
    svg.append('line').attr('x1', x(line)).attr('x2', x(line)).attr('y1', 0).attr('y2', 24).style('stroke', 'var(--color-fg)').style('stroke-width', 1.5);
    const lab = svg.append('text').attr('x', x(line)).attr('y', 37).attr('text-anchor', 'middle').style('font-size', '11px').style('fill', 'var(--color-fg-muted)').text(line + ' for control');
    if (x(line) + lab.node().getComputedTextLength() / 2 > W) lab.attr('text-anchor', 'end').attr('x', W);
  }
});
dash.draw('sim-map', (el) => {
  if (!EV.reset(el, ['state_tiles'])) return;
  const res = EV.sim();
  if (!res) { el.classList.add('dash-skeleton'); return; }
  const o = el.dataset.office, rows = o === 'senate' ? res.R.sen : res.R.gov, tiles = dash.data('state_tiles').data;
  const cs = getComputedStyle(el), mid0 = cs.getPropertyValue('--color-panel').trim(), mid = d3.color(mid0) ? mid0 : '#efeee9';
  const pc = {D: cs.getPropertyValue('--ev-d').trim(), R: cs.getPropertyValue('--ev-r').trim(), I: cs.getPropertyValue('--ev-i').trim()};
  const by = d3.group(rows, (r) => r.st), S = 50;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${12 * S} ${8 * S}`).attr('role', 'img');
  const t = EV.tip(el);
  tiles.forEach((s) => {
    const rs = by.get(s.st) || [];
    const gg = svg.append('g').attr('transform', `translate(${s.col * S + 2},${s.row * S + 2})`);
    if (!rs.length) gg.append('rect').attr('width', S - 4).attr('height', S - 4).attr('rx', 3).style('fill', 'var(--color-bg)').style('stroke', 'var(--color-border-line)');
    rs.forEach((r, i) => {
      const h = (S - 4) / rs.length;
      gg.append('rect').attr('y', i * h).attr('width', S - 4).attr('height', h - (rs.length > 1 && i === 0 ? 1 : 0)).attr('rx', 3)
        .style('fill', d3.interpolateRgb(mid, pc[r.side])(Math.min(1, 0.35 + Math.abs(r.m) / 25)))
        .style('stroke', r.changed ? 'var(--color-fg)' : 'none').style('stroke-width', 3);
    });
    gg.append('text').attr('x', (S - 4) / 2).attr('y', (S - 4) / 2 + 5).attr('text-anchor', 'middle').style('font-size', '14px').style('font-weight', 600)
      .style('fill', rs.length && rs.every((r) => Math.abs(r.m) > 6) ? '#fff' : 'var(--color-fg)').style('pointer-events', 'none').text(s.st);
    gg.append('rect').attr('width', S - 4).attr('height', S - 4).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        if (!rs.length) return t.show(ev, s.state, ['No race this year']);
        const lines = [];
        rs.forEach((r) => {
          if (rs.length > 1) lines.push(r.race);
          lines.push(`${r.chal || 'Challenger'} (${r.chal_p}) vs ${r.rep || 'Republican'} (R)`);
          lines.push(`Scenario ${EV.fmtM(r.m)} · actual ${EV.fmtM(r.margin)}${r.called ? '' : ' (uncalled)'}`);
          if (r.changed) lines.push('Changes hands');
        });
        t.show(ev, s.state, lines);
      })
      .on('mouseleave', () => t.hide());
  });
});
dash.draw('sim-housemap', (el) => {
  if (!EV.reset(el, ['state_tiles'])) return;
  const res = EV.sim();
  if (!res) { el.classList.add('dash-skeleton'); return; }
  const tiles = dash.data('state_tiles').data, by = d3.group(res.R.house, (r) => r.st), S = 50;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${12 * S} ${8 * S}`).attr('role', 'img');
  const t = EV.tip(el);
  tiles.forEach((s) => {
    const seats = (by.get(s.st) || []).slice().sort((a, b) => b.m - a.m);
    const gg = svg.append('g').attr('transform', `translate(${s.col * S + 2},${s.row * S + 2})`);
    gg.append('rect').attr('width', S - 4).attr('height', S - 4).attr('rx', 3).style('fill', 'var(--color-bg)').style('stroke', 'var(--color-border-line)');
    gg.append('text').attr('x', 3).attr('y', 10).style('font-size', '9px').style('font-weight', 600).style('fill', 'var(--color-fg-muted)').text(s.st);
    const n = seats.length, aw = S - 10, ah = S - 18, cols = Math.max(1, Math.ceil(Math.sqrt((n * aw) / ah))), side = Math.min(aw / cols, ah / Math.ceil(Math.max(1, n) / cols));
    seats.forEach((r, i) => {
      gg.append('rect').attr('x', 3 + (i % cols) * side).attr('y', 13 + Math.floor(i / cols) * side).attr('width', Math.max(1, side - 0.8)).attr('height', Math.max(1, side - 0.8))
        .style('fill', r.side === 'D' ? 'var(--ev-d)' : 'var(--ev-r)').style('stroke', r.changed ? 'var(--color-fg)' : 'none').style('stroke-width', 1);
    });
    gg.append('rect').attr('width', S - 4).attr('height', S - 4).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const d = seats.filter((r) => r.side === 'D').length, ch = seats.filter((r) => r.changed);
        const lines = [`Democrats ${d} · Republicans ${seats.length - d}`];
        if (ch.length) lines.push('Changes hands: ' + ch.map((r) => `${r.seat} (${EV.fmtM(r.m)})`).join(', '));
        t.show(ev, s.state, lines);
      })
      .on('mouseleave', () => t.hide());
  });
});
dash.draw('sim-flips', (tb) => {
  tb.replaceChildren();
  const res = EV.sim();
  const none = document.querySelectorAll('.ev [data-v="flips-none"]');
  if (!res) { none.forEach((n) => { n.hidden = true; }); return; }
  const ch = [...res.R.races, ...res.R.house].filter((r) => r.changed).sort((a, b) => Math.abs(a.m) - Math.abs(b.m));
  none.forEach((n) => { n.hidden = ch.length > 0; });
  const pill = (p, star) => { const s = document.createElement('span'); s.className = 'chip ' + p; s.textContent = p + (star ? '*' : ''); return s; };
  ch.forEach((r) => {
    const tr = tb.insertRow();
    tr.insertCell().textContent = ({senate: 'Senate · ', governor: 'Governor · ', house: 'House · '})[r.office] + r.race;
    tr.insertCell().append(pill(r.actualSide, !r.called));
    tr.insertCell().append(pill(r.side, false));
    const a = tr.insertCell(); a.className = 'num'; a.textContent = EV.fmtM(r.margin);
    const b = tr.insertCell(); b.className = 'num'; b.textContent = EV.fmtM(r.m);
  });
});
dash.draw('sim-nat', (el) => {
  const res = EV.sim();
  el.textContent = res ? `${EV.fmtM(res.R.nat)} (actual voter poll: ${EV.fmtM(res.R.actualNat)})` : '—';
});

/* ---------- controls ---------- */
(() => {
  const all = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  const show = (name) => {
    all('.ev .page', (s) => { s.hidden = s.id !== name; });
    all('.ev [data-tab]', (b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  };
  all('.ev [data-tab]', (b) => b.addEventListener('click', () => { show(b.dataset.tab); dash.setLink(b.dataset.tab); }));
  const h = location.hash.slice(1);
  if (h && document.querySelector('.ev .page#' + CSS.escape(h))) show(h);
  window.addEventListener('hashchange', () => { const x = location.hash.slice(1); if (x && document.querySelector('.ev .page#' + CSS.escape(x))) show(x); });
  all('.ev [data-hf]', (b) => b.addEventListener('click', () => {
    EV.houseFilter = b.dataset.hf;
    all('.ev [data-hf]', (x) => x.setAttribute('aria-pressed', String(x === b)));
    dash.draw('house-table');
  }));
  all('.ev .hsearch', (i) => i.addEventListener('input', () => { EV.houseQuery = i.value; dash.draw('house-table'); }));
  all('.ev .cm-race', (s) => s.addEventListener('change', () => { EV.cmRace = s.value; dash.draw('countymap2'); }));
  all('.ev .cm-measure', (s) => s.addEventListener('change', () => { EV.cmMeasure = s.value; dash.draw('countymap2'); }));
  all('.ev [data-mf]', (b) => b.addEventListener('click', () => {
    EV.mf = b.dataset.mf;
    all('.ev [data-mf]', (x) => x.setAttribute('aria-pressed', String(x === b)));
    dash.draw('measures-table');
  }));
  all('.ev .msearch', (i) => i.addEventListener('input', () => { EV.mq = i.value; dash.draw('measures-table'); }));
  all('.ev .tr-office', (s) => s.addEventListener('change', () => { EV.trOffice = s.value; dash.draw('trendmap'); dash.draw('trend-table'); }));
  all('.ev .tr-measure', (s) => s.addEventListener('change', () => { EV.trMeasure = s.value; dash.draw('trendmap'); dash.draw('trend-table'); }));
  all('.ev a[data-go]', (a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    all('.ev [data-tab="' + a.dataset.go + '"]', (b) => b.click());
  }));
  const showYear = (y) => {
    all('.ev .sim-year', (b) => b.setAttribute('aria-pressed', String(b.dataset.year === String(y))));
    all('.ev .y24', (s) => { s.hidden = y !== 24; });
    all('.ev .y20', (s) => { s.hidden = y !== 20; });
  };
  all('.ev .sim-in', (inp) => inp.addEventListener('input', () => {
    if (!EV.simS) return;
    EV.simS[inp.dataset.k] = +inp.value;
    EV.simRedraw();
  }));
  all('.ev .sim-year', (b) => b.addEventListener('click', () => {
    if (!EV.simS) return;
    const y = +b.dataset.year, B = EV.simS.B;
    Object.assign(EV.simS, {year: y, tr: y === 24 ? B.trump24 : B.trump20, hd: y === 24 ? B.harris24 : B.biden20});
    showYear(y);
    EV.simRedraw();
  }));
  all('.ev .sim-reset', (b) => b.addEventListener('click', () => {
    if (!EV.simS) return;
    EV.simS = EV.simDefaults();
    showYear(24);
    EV.simRedraw();
  }));
  dash.start();
})();
