/* Candidate WAR, same-ballot comparison, vote retention, turnout calibration check and pending races. */
(() => {
  const M = window.WarModel;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const f1 = (v) => d3.format('.1f')(v), signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f1(Math.abs(v));
  const FLAG = {
    uncontested: ['Uncontested', 'One major party had no candidate; left out of WAR summaries.'],
    rcv: ['Ranked choice', 'Alaska uses ranked-choice voting; the House margin is the final round against the independent.'],
    independent: ['Independent', 'An independent, not a Democrat, was the main challenger; WAR is measured for the independent.'],
    lopsided: ['Lopsided seat', 'The 2024 margin was 30+ points; WAR is compressed near the ceiling of a safe seat.'],
    rebound: ['2024 dip', 'This district moved 8+ points right from 2020 to 2024, so part of the WAR may be a return to its earlier lean.'],
  };
  const S = {office: 'all', sort: 'war-desc', q: '', swing: 7, ballotState: 'MI', retOffice: 'senate'};

  dash.calc('war_rows', {
    inputs: ['sim_races', 'sim_house', 'house', 'district_pres24', 'pres_totals', 'results_meta'],
    fn: (sim_races, sim_house, house, dp, pres_totals, meta) => {
      const y = pres_totals.find((r) => r.year === 2024), h = meta.house_counts;
      const nat24 = (100 * (y.dem - y.rep)) / y.total, nat26 = (100 * (h.dem - h.rep)) / h.total;
      const rows = M.warRows({simRaces: sim_races, simHouse: sim_house, house, districts: dp.districts, nat24, nat26});
      return {rows, nat24, nat26};
    },
  });
  const ready = () => EV.ok('war_rows');
  const label = (r) => r.office === 'house' ? r.race : (r.office === 'senate' ? 'Senate · ' : 'Governor · ') + r.st;
  const who = (r) => r.office === 'house' ? (r.candidates || '').replace(/;\s*/g, ' · ') : `${r.chal} (${r.chalParty}) v ${r.rep} (R)`;

  dash.draw('war-summary', (box) => {
    if (!EV.reset(box, ['war_rows'])) return;
    const {rows, nat24, nat26} = dash.data('war_rows').data;
    const cf = M.normalMidterm(rows, {nat24, nat26, swingFrom2024: S.swing});
    const env = nat24 + S.swing;
    const p = el('p', 'note');
    p.append('Actual: 2024 presidential ', el('b', null, EV.fmtM(nat24)), ' to 2026 House ', el('b', null, EV.fmtM(nat26)),
      `, a ${f1(nat26 - nat24)}-point swing. At a ${S.swing}-point swing the national House vote would be `, el('b', null, EV.fmtM(env)), '.');
    box.append(p);
    const grid = el('div', 'big war-big');
    [['senate', 'Senate races'], ['governor', 'Governor races'], ['house', 'House seats']].forEach(([o, name]) => {
      const set = cf.filter((r) => r.office === o);
      const toR = set.filter((r) => r.changes && r.cfSide === 'R').length, toD = set.filter((r) => r.changes && r.cfSide !== 'R').length;
      const d = el('div'); d.append(el('b', null, `${toR} → R${toD ? ` · ${toD} → D` : ''}`), el('span', null, `${name} that change hands`)); grid.append(d);
    });
    box.append(grid);
    const st = M.summarize(rows.filter((r) => r.office === 'house'));
    box.append(el('p', 'note', `House WAR across ${st.n} contested seats: median ${signed(st.median)}, mean ${signed(st.mean)}. ${st.excluded} uncontested seats are left out.`));
  });

  dash.draw('war-table', (box) => {
    if (!EV.reset(box, ['war_rows'])) return;
    const {rows, nat24, nat26} = dash.data('war_rows').data;
    let list = M.normalMidterm(rows, {nat24, nat26, swingFrom2024: S.swing});
    if (S.office !== 'all') list = list.filter((r) => r.office === S.office);
    if (S.q) { const q = S.q.toLowerCase(); list = list.filter((r) => (label(r) + ' ' + who(r)).toLowerCase().includes(q)); }
    const by = {'war-desc': (a, b) => b.war - a.war, 'war-asc': (a, b) => a.war - b.war, 'flip': (a, b) => Math.abs(a.cfMargin) - Math.abs(b.cfMargin), 'changes': (a, b) => (b.changes - a.changes) || (a.margin - b.margin)};
    list.sort((a, b) => (a.contested === b.contested ? 0 : a.contested ? -1 : 1) || by[S.sort](a, b));
    const t = el('table'), head = t.createTHead().insertRow();
    [['Race', ''], ['Candidates', 'hide-narrow'], ['2024 pres.', 'num'], ['Expected', 'num hide-narrow'], ['Actual', 'num'], ['WAR', 'num'], ['', 'war-bar-h hide-narrow'], [`At +${S.swing}`, 'num'], ['Notes', 'hide-narrow']].forEach(([h, c]) => { const th = el('th', c, h); th.scope = 'col'; head.append(th); });
    const body = t.createTBody(), max = 20;
    list.forEach((r) => {
      const tr = body.insertRow();
      tr.insertCell().textContent = label(r);
      const c = tr.insertCell(); c.className = 'hide-narrow muted'; c.textContent = who(r);
      [[EV.fmtM(r.base), 'num'], [EV.fmtM(r.expected), 'num hide-narrow'], [EV.fmtM(r.margin), 'num']].forEach(([v, cls]) => { const x = tr.insertCell(); x.className = cls; x.textContent = v; });
      const w = tr.insertCell(); w.className = 'num'; w.textContent = r.contested ? signed(r.war) : '—';
      const bc = tr.insertCell(); bc.className = 'hide-narrow';
      if (r.contested) {
        const bar = el('span', 'war-bar'), fillEl = el('span'), v = Math.max(-max, Math.min(max, r.war));
        fillEl.style.width = (50 * Math.abs(v)) / max + '%'; fillEl.style.left = v >= 0 ? '50%' : 50 - (50 * Math.abs(v)) / max + '%';
        fillEl.style.background = EV.fill(r.war >= 0 ? (r.chalParty === 'I' ? 'I' : 'D') : 'R');
        bar.title = `WAR ${signed(r.war)}: ${r.war >= 0 ? 'challenger' : 'Republican'} beat the baseline`; bar.append(fillEl); bc.append(bar);
      }
      const out = tr.insertCell(); out.className = 'num';
      const tag = el('span', 'war-side ' + r.cfSide, (r.cfSide === 'R' ? 'R' : r.cfSide) + (r.changes ? ' · flips' : '')); out.append(tag); out.title = `Margin at a ${S.swing}-point swing: ${EV.fmtM(r.cfMargin)}`;
      const n = tr.insertCell(); n.className = 'hide-narrow';
      r.flags.forEach((fl) => { const b = el('span', 'war-flag', FLAG[fl][0]); b.title = FLAG[fl][1]; n.append(b); });
    });
    box.append(t);
    box.append(el('p', 'note', `${list.length} races. Hover a note for what it means. “At +${S.swing}” shows who would win if every margin moved by the same amount to a ${S.swing}-point swing from 2024.`));
  });

  /* ---------- same-ballot comparison ---------- */
  const raceKeys = [['sen26', 'Senate'], ['gov26', 'Governor'], ['house26', 'House (all districts)']];
  const countyMargin = (c, k) => (c[k + '_d'] == null ? null : c[k + '_d'] - c[k + '_r']);
  dash.draw('ballot-state', (sel) => {
    if (!EV.ok('counties') || sel.options.length) return;
    const states = d3.groups(dash.data('counties').data, (c) => c.st)
      .filter(([, cs]) => raceKeys.filter(([k]) => cs.some((c) => c[k + '_total'])).length >= 2).map(([st]) => st).sort();
    states.forEach((st) => { const o = el('option', null, st); o.value = st; sel.append(o); });
    sel.value = states.includes(S.ballotState) ? S.ballotState : states[0]; S.ballotState = sel.value; sel.disabled = false;
  });
  dash.draw('ballot-compare', (box) => {
    if (!EV.reset(box, ['counties'])) return;
    const cs = dash.data('counties').data.filter((c) => c.st === S.ballotState);
    const keys = raceKeys.filter(([k]) => cs.some((c) => c[k + '_total']));
    const tot = (k) => { let d = 0, r = 0, t = 0; cs.forEach((c) => { if (c[k + '_total']) { d += c[k + '_d'] * c[k + '_total']; r += c[k + '_r'] * c[k + '_total']; t += c[k + '_total']; } }); return t ? (d - r) / t : null; };
    const big = el('div', 'big war-big');
    keys.forEach(([k, name]) => { const d = el('div'); d.append(el('b', null, EV.fmtM(tot(k))), el('span', null, name + ', two-party')); big.append(d); });
    box.append(big);
    const [a, b] = keys;
    if (b) {
      const behind = cs.filter((c) => countyMargin(c, a[0]) != null && countyMargin(c, b[0]) != null);
      const n = behind.filter((c) => countyMargin(c, a[0]) < countyMargin(c, b[0])).length;
      box.append(el('p', 'note', `The ${a[1]} Democrat ran behind the ${b[1].toLowerCase()} Democrat in ${n} of ${behind.length} counties.`));
    }
    const t = el('table'), head = t.createTHead().insertRow();
    ['County', '2026 votes', '2024 pres.', ...keys.map(([, n]) => n.replace(' (all districts)', '')), b ? `${a[1]} − ${b[1]}` : null].filter(Boolean).forEach((h, i) => { const th = el('th', i ? 'num' : '', h); th.scope = 'col'; head.append(th); });
    const body = t.createTBody();
    cs.slice().sort((x, y) => (y.t26 || 0) - (x.t26 || 0)).forEach((c) => {
      const tr = body.insertRow(); tr.insertCell().textContent = c.county;
      const vals = [d3.format(',')(c.t26 || 0), c.m24 == null ? '' : EV.fmtM(c.m24), ...keys.map(([k]) => { const m = countyMargin(c, k); return m == null ? '' : EV.fmtM(m); })];
      if (b) { const x = countyMargin(c, a[0]), y = countyMargin(c, b[0]); vals.push(x == null || y == null ? '' : signed(x - y)); }
      vals.forEach((v) => { const td = tr.insertCell(); td.className = 'num'; td.textContent = v; });
    });
    const tb = el('div', 'tablebox'); tb.append(t); box.append(tb);
  });

  /* ---------- retention ---------- */
  dash.calc('retention', {
    inputs: ['senate_candidates', 'senate_races', 'governor_candidates', 'governor_races', 'district_pres24'],
    fn: (sc, sr, gc, gr, dp) => ({senate: M.retention(sc, sr, dp.districts), governor: M.retention(gc, gr, dp.districts)}),
  });
  dash.draw('retention', (box) => {
    if (!EV.reset(box, ['retention'])) return;
    const rows = dash.data('retention').data[S.retOffice].slice().sort((a, b) => b.gap - a.gap);
    const key = el('p', 'note');
    const sw = (p, text) => { const s = el('span', 'ret-key'); const c = el('i'); c.style.background = EV.fill(p); s.append(c, text); return s; };
    key.append(sw('D', 'Democratic (or independent) nominee, as % of Harris 2024 votes'), sw('R', 'Republican nominee, as % of Trump 2024 votes'));
    box.append(key);
    const scale = Math.max(120, d3.max(rows, (r) => Math.max(r.challengerShare, r.repShare)));
    rows.forEach((r) => {
      const g = el('div', 'ret-row');
      g.append(el('span', 'ret-name', r.race));
      const bars = el('div', 'ret-bars');
      [[r.challengerParty, r.challengerShare, r.challengerVotes, r.harris, 'Harris'], ['R', r.repShare, r.repVotes, r.trump, 'Trump']].forEach(([p, v, votes, base, nm]) => {
        const line = el('div', 'ret-line'), track = el('span', 'evidence-track'), bar = el('span');
        bar.style.width = (100 * v) / scale + '%'; bar.style.background = EV.fill(p); track.append(bar);
        const ref = el('span', 'ret-ref'); ref.style.left = (100 * 100) / scale + '%'; track.append(ref);
        line.title = `${d3.format(',')(votes)} votes vs. ${d3.format(',')(base)} for ${nm} in 2024`;
        line.append(track, el('b', null, Math.round(v) + '%')); bars.append(line);
      });
      g.append(bars); g.append(el('span', 'ret-gap', signed(r.gap) + ' pts')); box.append(g);
    });
    box.append(el('p', 'note', 'The thin line marks 100% of the 2024 presidential vote. The right-hand number is the challenger’s share minus the Republican’s. These are aggregate ratios, not tracked individual voters: some 2026 votes came from people who skipped 2024, and some 2024 voters switched.'));
  });

  /* ---------- turnout calibration check ---------- */
  const PRESETS = {
    jl: {label: 'J.L. Partners turnout, voter-poll vote choices (simulator default)', v: {harrisTurnout: 78, trumpTurnout: 65, harrisToRep: 2, trumpToDem: 7, harrisOther: 1, trumpOther: 2}},
    inferred: {label: 'Voter-poll inferred turnout', v: {harrisTurnout: 78.5, trumpTurnout: 68.4, harrisToRep: 2, trumpToDem: 7, harrisOther: 1, trumpOther: 2}},
    jlRaw: {label: 'J.L. Partners as reported (12% of Trump voters who voted backed Democrats)', v: {harrisTurnout: 78, trumpTurnout: 65, harrisToRep: 2, trumpToDem: 12.1, harrisOther: 1, trumpOther: 9.1}},
    bsl: {label: 'Broome Street Labs: a third of Trump voters skipped, 6% crossover; Harris from Georgia', v: {harrisTurnout: 77, trumpTurnout: 67, harrisToRep: 2, trumpToDem: 6, harrisOther: 1, trumpOther: 2}},
  };
  const C = {...PRESETS.jl.v};
  const FIELDS = [['harrisTurnout', '2024 Harris voters who voted (%)'], ['trumpTurnout', '2024 Trump voters who voted (%)'], ['harrisToRep', 'Harris voters who voted Republican (% of those voting)'], ['trumpToDem', 'Trump voters who voted Democratic (% of those voting)']];
  dash.draw('calibration-check', (box) => {
    if (!EV.reset(box, ['pres_totals', 'results_meta'])) return;
    const y = dash.data('pres_totals').data.find((r) => r.year === 2024), counted = dash.data('results_meta').data.house_counts;
    const VEP_2024 = 244666890, BALLOTS_2024 = 155547700;
    const controls = el('div', 'scenario-controls');
    const pl = el('div'); const ps = el('select'); ps.id = 'cal-preset'; const lab = el('label', null, 'Start from'); lab.htmlFor = 'cal-preset';
    const custom = el('option', null, 'Custom'); custom.value = ''; ps.append(custom);
    Object.entries(PRESETS).forEach(([k, p]) => { const o = el('option', null, p.label); o.value = k; ps.append(o); });
    ps.value = Object.keys(PRESETS).find((k) => FIELDS.every(([f]) => PRESETS[k].v[f] === C[f]) && PRESETS[k].v.trumpOther === C.trumpOther) || '';
    ps.addEventListener('change', () => { if (PRESETS[ps.value]) { Object.assign(C, PRESETS[ps.value].v); dash.draw('calibration-check'); } });
    pl.append(lab, ps); controls.append(pl);
    FIELDS.forEach(([k, text]) => {
      const d = el('div'), id = 'cal-' + k, l = el('label', null, text), i = el('input'); l.htmlFor = id;
      Object.assign(i, {id, type: 'number', min: 0, max: 100, step: 0.1, value: C[k]});
      i.addEventListener('change', () => { C[k] = +i.value; dash.draw('calibration-check'); document.getElementById(id)?.focus(); });
      d.append(l, i); controls.append(d);
    });
    box.append(controls);
    const r = M.calibrationCheck({harris: y.dem, trump: y.rep, counted, ...C, restPool: VEP_2024 - BALLOTS_2024 + (y.total - y.dem - y.rep)});
    if (!r.valid) { box.append(el('p', 'note', r.reason)); return; }
    const stats = el('div', 'big war-big');
    [[EV.fmtM(r.margin), 'Modeled national House vote'], [EV.fmtM(r.countedMargin), 'Counted'], [signed(r.miss), 'Miss, points']].forEach(([v, t]) => { const d = el('div'); d.append(el('b', null, v), el('span', null, t)); stats.append(d); });
    box.append(stats);
    const verdict = !r.feasible ? 'Not possible: these two groups alone cast more votes than were counted.'
      : Math.abs(r.miss) <= 1 ? 'Consistent with the count (within 1 point).'
      : Math.abs(r.miss) <= 2.5 ? 'Close, but off by more than a point.' : 'Does not match the count.';
    const v = el('p'); v.append(el('b', null, verdict)); box.append(v);
    box.append(el('p', 'note', `The two 2024 cohorts cast ${d3.format('.1f')(r.cohortVotes / 1e6)}M votes, leaving ${d3.format('.1f')(Math.max(r.rest, 0) / 1e6)}M from 2024 third-party voters and nonvoters${r.restRate == null ? '' : ` (${f1(Math.max(r.restRate, 0))}% of that pool)`}. Modeled: Democrats ${d3.format('.1f')(r.dem / 1e6)}M, Republicans ${d3.format('.1f')(r.rep / 1e6)}M; counted ${d3.format('.1f')(counted.dem / 1e6)}M and ${d3.format('.1f')(counted.rep / 1e6)}M.`));
  });

  /* ---------- pending races ---------- */
  dash.draw('pending-races', (box) => {
    if (!EV.reset(box, ['house', 'senate_races', 'governor_races'])) return;
    const rows = [...dash.data('senate_races').data.filter((r) => r.status !== 'Called').map((r) => ({race: 'Senate · ' + r.st, step: r.note, date: r.next_date, url: r.source_url})),
      ...dash.data('governor_races').data.filter((r) => r.status !== 'Called').map((r) => ({race: 'Governor · ' + r.st, step: r.note, date: r.next_date, url: r.source_url})),
      ...dash.data('house').data.filter((r) => r.status !== 'Called').map((r) => ({race: 'House · ' + r.seat, step: r.next_step || r.note, date: r.next_date, url: r.next_source_url || r.status_source_url}))];
    if (!rows.length) { box.append(el('p', 'note', 'Every race has been called.')); return; }
    rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const t = el('table'), head = t.createTHead().insertRow();
    ['Race', 'What happens next', 'Date'].forEach((h) => { const th = el('th', null, h); th.scope = 'col'; head.append(th); });
    const body = t.createTBody();
    rows.forEach((r) => {
      const tr = body.insertRow(); tr.insertCell().textContent = r.race;
      const s = tr.insertCell(); s.append(r.step || '');
      if (r.url) { s.append(' · '); const a = el('a', null, 'Source'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; s.append(a); }
      tr.insertCell().textContent = r.date ? d3.timeFormat('%b. %-d')(new Date(r.date + 'T12:00:00')) : 'Not set';
    });
    box.append(t);
  });

  /* ---------- controls ---------- */
  const redraw = () => ['war-summary', 'war-table'].forEach((n) => dash.draw(n));
  document.querySelectorAll('#war-office').forEach((s) => s.addEventListener('change', () => { S.office = s.value; redraw(); }));
  document.querySelectorAll('#war-sort').forEach((s) => s.addEventListener('change', () => { S.sort = s.value; redraw(); }));
  document.querySelectorAll('#war-q').forEach((s) => s.addEventListener('input', () => { S.q = s.value.trim(); dash.draw('war-table'); }));
  document.querySelectorAll('#war-swing').forEach((s) => s.addEventListener('input', () => { S.swing = +s.value; document.querySelectorAll('[data-war-swing]').forEach((o) => { o.textContent = '+' + s.value; }); redraw(); }));
  document.querySelectorAll('[data-draw="ballot-state"]').forEach((s) => s.addEventListener('change', () => { S.ballotState = s.value; dash.draw('ballot-compare'); }));
  document.querySelectorAll('.ret-office').forEach((b) => b.addEventListener('click', () => {
    S.retOffice = b.dataset.office; document.querySelectorAll('.ret-office').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dash.draw('retention');
  }));
  window.WarView = {state: S, calibration: C, ready};
})();
