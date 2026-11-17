/* New Jersey vote growth and a fixed-participation national turnout exercise. */
(() => {
  let gap = 4, reference = 'inferred';
  const number = (v) => d3.format(',')(v);
  const one = (v) => d3.format('.1f')(v);
  const two = (v) => d3.format('.2f')(v);
  const gapLabel = (v) => Math.abs(v) < 0.00001 ? 'Equal turnout' : `${v > 0 ? 'Harris' : 'Trump'} +${one(Math.abs(v))} points`;
  function link(parent, text, url) { const a = document.createElement('a'); a.textContent = text; a.href = url; parent.append(a); }
  dash.draw('nj-turnout', (el) => {
    if (!EV.reset(el, ['turnout_context'])) return;
    const data = dash.data('turnout_context').data, nj = data.nj, c = EnvironmentModel.njComparison(nj);
    const rows = [['Democratic vote', nj.governor_2021.dem_name, nj.governor_2021.dem, nj.governor_2025.dem_name, nj.governor_2025.dem, c.demIncrease, c.demGrowth],
      ['Republican vote', nj.governor_2021.rep_name, nj.governor_2021.rep, nj.governor_2025.rep_name, nj.governor_2025.rep, c.repIncrease, c.repGrowth]];
    const bars = document.createElement('div'); bars.className = 'nj-vote-bars';
    const max = Math.max(...rows.map((r) => r[4]));
    rows.forEach((r, i) => {
      [[r[1], 2021, r[2]], [r[3], 2025, r[4]]].forEach(([name, year, votes]) => {
        const line = document.createElement('div'); line.className = 'evidence-row nj-vote-row';
        const label = document.createElement('span'); label.textContent = `${year} · ${name}`;
        const track = document.createElement('span'); track.className = 'evidence-track'; track.setAttribute('aria-hidden', 'true');
        const bar = document.createElement('span'); bar.style.width = (100 * votes / max) + '%'; bar.style.background = EV.fill(i ? 'R' : 'D'); bar.style.opacity = year === 2021 ? '.6' : '1'; track.append(bar);
        const value = document.createElement('b'); value.textContent = number(votes); line.append(label, track, value); bars.append(line);
      });
    });
    el.append(bars);
    const tablebox = document.createElement('div'); tablebox.className = 'tablebox';
    const table = document.createElement('table'), head = table.createTHead().insertRow();
    ['Vote comparison', '2021 votes', '2025 votes', 'Increase', 'Growth', '2025 / same-party 2024 vote'].forEach((label) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
    const body = table.createTBody();
    rows.forEach((r, i) => {
      const tr = body.insertRow();
      [r[0], number(r[2]), number(r[4]), '+' + number(r[5]), '+' + one(r[6]) + '%', one(i ? c.repRatio : c.demRatio) + '%'].forEach((text) => { tr.insertCell().textContent = text; });
    });
    tablebox.append(table); el.append(tablebox);
    const summary = document.createElement('p'); summary.className = 'note'; summary.textContent = `Democratic votes rose by ${number(c.demIncrease)}, versus ${number(c.repIncrease)} Republican votes. Registered-voter turnout rose from ${two(c.turnout2021)}% to ${two(c.turnout2025)}%: ${number(nj.turnout_2021.ballots)} of ${number(nj.turnout_2021.registered)} registered voters in 2021; ${number(nj.turnout_2025.ballots)} of ${number(nj.turnout_2025.registered)} in 2025.`; el.append(summary);
    const denominator = document.createElement('p'); denominator.className = 'note'; denominator.textContent = `The ${one(c.demRatio)}% and ${one(c.repRatio)}% ratios divide Sherrill’s votes by Harris’s ${number(nj.president_2024.dem)}, and Ciattarelli’s by Trump’s ${number(nj.president_2024.rep)}. They compare aggregate vote totals; they do not tell us what percentage of those individual presidential voters returned. Switching, new voters and population changes can contribute.`; el.append(denominator);
    const counterfactual = document.createElement('p'); counterfactual.className = 'note'; counterfactual.textContent = `Holding Murphy’s 2021 vote and the other listed candidates’ votes fixed, replacing only Ciattarelli’s 2021 total with his 2025 total gives Ciattarelli ${two(c.counterfactualRepShare)}% of ${number(c.counterfactualTotal)} votes. The denominator increases with the added Republican votes. This reproduces the roughly 51% counterfactual.`; el.append(counterfactual);
    const polling = document.createElement('p'); polling.className = 'note'; polling.textContent = `The final RealClearPolling average (Oct. 14–30) was D+${one(nj.polling_2025.margin)}; the official listed-candidate result was ${EV.fmtM(c.margin2025)}, a ${one(c.margin2025 - nj.polling_2025.margin)}-point difference in margin. Vote growth and higher turnout are consistent with turnout contributing to the polling miss; these totals do not establish how much came from turnout, switching, late movement or survey error.`; el.append(polling);
    const details = document.createElement('details'), title = document.createElement('summary'); title.textContent = 'Official counts, polling benchmark and denominators'; details.append(title);
    const ul = document.createElement('ul'); Object.values(data.sources).filter((s) => s !== data.sources.pew2022).forEach((s) => { const li = document.createElement('li'); link(li, s.label, s.url); ul.append(li); }); details.append(ul);
    const notes = document.createElement('p'); notes.textContent = 'Turnout uses all ballots cast divided by registered voters. The vote table and counterfactual use votes for listed governor candidates, excluding any unlisted write-ins. These denominators differ because of rejected ballots, undervotes and unlisted choices. The Democratic increase is 557,139 against Murphy’s official 2021 total.'; details.append(notes); el.append(details);
  });
  dash.draw('turnout-gap-values', (el) => {
    const status = el.querySelector('.turnout-gap-status');
    const write = (key, text) => el.querySelectorAll(`[data-gap-value="${key}"]`).forEach((e) => { e.textContent = text; });
    const ready = EV.ok('turnout_context', 'jl_partners', ...EV.SIMDATA);
    el.querySelectorAll('.apply-turnout-gap, .apply-scaled-turnout, [data-gap-preset], #turnout-gap, #turnout-reference').forEach((b) => { b.disabled = !ready; });
    if (!ready) { if (status) status.textContent = EV.failed('turnout_context', 'jl_partners', ...EV.SIMDATA) ? 'Turnout comparison failed to load. Reload to try again.' : 'Loading turnout comparison…'; return; }
    if (status) status.textContent = '';
    const data = dash.data('turnout_context').data, jl = dash.data('jl_partners').data;
    const s = EV.turnoutGapScenario(gap, reference), defaults = EV.turnoutReference(reference);
    const jlTrump = 100 - jl.trump_outcomes.find((r) => r.label === 'Stayed home').value;
    const jlHarris = 100 - jl.harris_stayed_home;
    Object.entries({gap: gapLabel(gap), actual: EV.fmtM(s.base.nat), margin: EV.fmtM(s.result.nat),
      dem: one(s.rates.demRate) + '%', rep: one(s.rates.repRate) + '%', voters: number(Math.round(s.rates.combinedVoters)),
      baseDem: one(defaults.hd) + '%', baseRep: one(defaults.tr) + '%', baseGap: gapLabel(defaults.hd - defaults.tr),
      seats: s.result.hD + ' D / ' + s.result.hR + ' R', shift: EV.fmtM(s.result.nat - s.base.nat) + ' shift',
      jlDem: jlHarris + '%', jlRep: jlTrump + '%', jlGap: (jlHarris - jlTrump) + ' points',
      pewDem: data.pew_2022.biden2020_turnout + '%', pewRep: data.pew_2022.trump2020_turnout + '%'}).forEach(([key, value]) => write(key, value));
    write('reference', reference === 'jl' ? 'J.L. Partners calibration' : 'Voter-poll inferred calibration');
    const decomposition = jl.swing_decomposition, observedGap = jlHarris - jlTrump;
    const scaled = EnvironmentModel.scaledTurnoutSwing({presidentialMargin: decomposition.presidential_margin,
      turnoutSwing: decomposition.turnout, switchingSwing: decomposition.switching, observedGap, targetGap: gap});
    write('scaledFormula', `${decomposition.presidential_margin} + ${decomposition.turnout} × (${one(gap)} ÷ ${observedGap}) + ${decomposition.switching} = ${EV.fmtM(scaled.margin)}`);
    write('scaledMargin', EV.fmtM(scaled.margin));
    const scaledButton = el.querySelector('.apply-scaled-turnout'); if (scaledButton) scaledButton.disabled = Math.abs(scaled.margin - s.base.nat) > 20;
    const methods = el.querySelector('.turnout-methods'); methods.replaceChildren();
    [['Cohort reweighting · voter-poll inferred', 'inferred'], ['Cohort reweighting · J.L. Partners calibrated', 'jl']].forEach(([label, ref]) => {
      const r = EV.turnoutGapScenario(gap, ref), start = EV.turnoutReference(ref), tr = methods.insertRow();
      [label, gapLabel(start.hd - start.tr), EV.fmtM(r.result.nat), 'Within-group vote choices held fixed; combined participation held fixed.'].forEach((text) => { tr.insertCell().textContent = text; });
    });
    const scaledRow = methods.insertRow();
    ['Proportional decomposition · Grok arithmetic', 'Harris +' + observedGap + ' points', EV.fmtM(scaled.margin), 'Scale the 10-point turnout swing by the turnout-gap ratio; hold the rounded 5-point switching component fixed.'].forEach((text) => { scaledRow.insertCell().textContent = text; });
    el.querySelectorAll('[data-gap-preset]').forEach((b) => {
      const value = b.dataset.gapPreset === 'baseline' ? defaults.hd - defaults.tr : +b.dataset.gapPreset;
      b.setAttribute('aria-pressed', String(Math.abs(gap - value) < 0.00001));
    });
    const input = el.querySelector('#turnout-gap'); if (input && document.activeElement !== input) input.value = gap;
    const source = el.querySelector('.pew-turnout-source'); if (source) source.href = data.sources.pew2022.url;
    const tb = el.querySelector('.turnout-gap-alternatives'); tb.replaceChildren();
    [['Selected calibration baseline', defaults.hd - defaults.tr], ['2022 gap reversed', data.pew_2022.trump2020_turnout - data.pew_2022.biden2020_turnout], ['Equal participation', 0], ['2022 gap in original direction', data.pew_2022.biden2020_turnout - data.pew_2022.trump2020_turnout]].forEach(([label, g]) => {
      const row = EV.turnoutGapScenario(g, reference), tr = tb.insertRow();
      [label, gapLabel(g), one(row.rates.demRate) + '%', one(row.rates.repRate) + '%', EV.fmtM(row.result.nat), row.result.hD + ' D / ' + row.result.hR + ' R'].forEach((text) => { tr.insertCell().textContent = text; });
    });
  });
  function applySimulator(S, note) {
    EV.simS = S;
    document.querySelectorAll('.sim-year').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.year === '24')));
    document.querySelectorAll('.y24').forEach((e) => { e.hidden = false; }); document.querySelectorAll('.y20').forEach((e) => { e.hidden = true; });
    document.querySelector('[data-tab="sim"]').click(); EV.simRedraw();
    document.getElementById('sim-scenario-note').textContent = note;
  }
  document.querySelectorAll('[data-gap-preset]').forEach((b) => b.addEventListener('click', () => {
    if (!EV.ok(...EV.SIMDATA)) return;
    const S = EV.turnoutReference(reference); gap = b.dataset.gapPreset === 'baseline' ? S.hd - S.tr : +b.dataset.gapPreset;
    dash.draw('turnout-gap-values');
  }));
  document.querySelectorAll('#turnout-gap').forEach((input) => input.addEventListener('input', () => { gap = +input.value; dash.draw('turnout-gap-values'); }));
  document.querySelectorAll('#turnout-reference').forEach((input) => input.addEventListener('change', () => { reference = input.value; dash.draw('turnout-gap-values'); }));
  document.querySelectorAll('.apply-turnout-gap').forEach((b) => b.addEventListener('click', () => {
    const s = EV.turnoutGapScenario(gap, reference); if (!s) return;
    applySimulator(s.S, `Turnout-gap scenario: ${gapLabel(gap)}; ${reference === 'jl' ? 'J.L. Partners calibrated' : 'voter-poll inferred'} reference. Combined Trump/Harris participation held fixed; national environment, approval, new-voter turnout and within-group vote choices reset to baseline.`);
  }));
  document.querySelectorAll('.apply-scaled-turnout').forEach((b) => b.addEventListener('click', () => {
    if (!EV.ok('jl_partners', ...EV.SIMDATA)) return;
    const jl = dash.data('jl_partners').data, d = jl.swing_decomposition;
    const observedGap = (100 - jl.harris_stayed_home) - (100 - jl.trump_outcomes.find((r) => r.label === 'Stayed home').value);
    const scaled = EnvironmentModel.scaledTurnoutSwing({presidentialMargin: d.presidential_margin, turnoutSwing: d.turnout, switchingSwing: d.switching, observedGap, targetGap: gap});
    const actual = dash.data('national_env').data.find((r) => r.key === 'nat26').value, delta = scaled.margin - actual;
    if (Math.abs(delta) > 20) return;
    applySimulator({...EV.simDefaults(), env: delta}, `Proportional-decomposition scenario: ${EV.fmtM(scaled.margin)} at ${gapLabel(gap)}. Applied once as a uniform national shift; turnout and approval sliders reset. This is an analyst scaling assumption, not a J.L. Partners counterfactual.`);
  }));
})();
