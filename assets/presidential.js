/* Historical references and editable 2028 national popular-vote scenarios. */
(() => {
  let settings = null, snapshots = [], validScenario = null;
  const n = (v) => d3.format(',')(Math.round(v)), p = (v) => d3.format('.1f')(v) + '%';
  const $ = (selector) => document.querySelector(selector);
  const data = () => dash.data('presidential_2028').data;
  const write = (key, value) => document.querySelectorAll(`[data-p28-value="${key}"]`).forEach((el) => { el.textContent = value; });
  const source = (parent, label, url) => { const a = document.createElement('a'); a.textContent = label; a.href = url; parent.append(a); };
  function redraw() { dash.draw('p28-values'); }
  function markCustom() { $('#p28-turnout-pattern').value = 'custom'; }
  dash.draw('p28-history', (tb) => {
    tb.replaceChildren(); if (!EV.ok('presidential_2028')) return;
    data().historical_results.forEach((r) => {
      const tr = tb.insertRow(); [r.year, r.office, EV.fmtM(r.margin)].forEach((text) => { tr.insertCell().textContent = text; });
      source(tr.insertCell(), data().sources[r.source].label, data().sources[r.source].url);
    });
  });
  dash.draw('p28-transitions', (tb) => {
    tb.replaceChildren(); if (!EV.ok('presidential_2028')) return;
    data().transitions.forEach((r) => {
      const tr = tb.insertRow();
      [r.from + ' → ' + r.to, r.dem_name, (r.from === 2016 ? '≈' : '') + r.dem_turnout + '%', r.rep_name, (r.from === 2016 ? '≈' : '') + r.rep_turnout + '%', r.precision].forEach((text) => { tr.insertCell().textContent = text; });
      source(tr.insertCell(), 'Pew study', data().sources[r.source].url);
    });
  });
  dash.draw('p28-sources', (ul) => {
    if (!EV.reset(ul, ['presidential_2028'])) return;
    Object.values(data().sources).forEach((s) => { const li = document.createElement('li'); source(li, s.label, s.url); ul.append(li); });
  });
  function drawSnapshots() {
    const tb = $('.p28-snapshots'); tb.replaceChildren();
    snapshots.forEach((s, index) => {
      const tr = tb.insertRow();
      [s.name, EV.fmtM(s.result.margin), n(s.result.totals.voters), p(s.settings.demReturn), p(s.settings.repReturn), n(s.settings.entrantMillions * 1e6)].forEach((text) => { tr.insertCell().textContent = text; });
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = 'Remove'; button.setAttribute('aria-label', 'Remove ' + s.name);
      button.addEventListener('click', () => { snapshots.splice(index, 1); drawSnapshots(); }); tr.insertCell().append(button);
    });
    $('.p28-no-snapshots').hidden = snapshots.length > 0;
  }
  dash.draw('p28-values', (el) => {
    const status = $('#p28-status');
    if (!EV.ok('presidential_2028')) { status.textContent = EV.failed('presidential_2028') ? 'Scenario data failed to load. Reload to try again.' : 'Loading historical benchmarks…'; return; }
    if (!settings) settings = {...data().defaults};
    document.querySelectorAll('[data-p28-setting], [data-p28-action], #p28-turnout-pattern, #p28-entrant-pattern').forEach((input) => { input.disabled = false; });
    document.querySelectorAll('[data-p28-setting]').forEach((input) => { if (document.activeElement !== input) input.value = settings[input.dataset.p28Setting]; });
    let scenario;
    try { scenario = PresidentialModel.build(data(), settings); }
    catch (error) {
      validScenario = null; status.textContent = error.message;
      document.querySelectorAll('[data-p28-value]').forEach((e) => { e.textContent = '—'; });
      document.querySelectorAll('[data-p28-action="save"], [data-p28-action="export"], [data-p28-action="comeback"]').forEach((e) => { e.disabled = true; });
      $('.p28-flow').replaceChildren(); $('.p28-alternatives').replaceChildren();
      $('.p28-votebar').replaceChildren(); $('.p28-votebar').setAttribute('aria-label', 'Scenario unavailable: correct the input assumptions.'); return;
    }
    validScenario = scenario; status.textContent = '';
    const {result: r} = scenario;
    const fields = {margin: r.margin == null ? 'No votes' : EV.fmtM(r.margin), voters: n(r.totals.voters), demVotes: n(r.totals.dem), repVotes: n(r.totals.rep), otherVotes: n(r.totals.other),
      demShare: r.shares.dem == null ? '—' : p(r.shares.dem), repShare: r.shares.rep == null ? '—' : p(r.shares.rep), otherShare: r.shares.other == null ? '—' : p(r.shares.other),
      demLoyalty: p(100 - settings.demCross - settings.demOther), repLoyalty: p(100 - settings.repCross - settings.repOther),
      otherRep: p(100 - settings.otherDem - settings.otherOther), entrantRep: p(100 - settings.entrantDem - settings.entrantOther),
      entrantTie: r.entrantTieShare == null ? 'No feasible tie by changing only the entrant mix at this volume.' : p(r.entrantTieShare) + ' Democratic among new/returning voters would tie the national vote, with their other-candidate share fixed.'};
    Object.entries(fields).forEach(([key, value]) => write(key, value));
    const bar = $('.p28-votebar'); bar.replaceChildren(); bar.setAttribute('aria-label', `Hypothetical popular vote: Democratic ${fields.demShare}, Republican ${fields.repShare}, other ${fields.otherShare}.`);
    ['dem', 'rep', 'other'].forEach((key) => {
      const segment = document.createElement('span'); segment.style.width = (r.shares[key] || 0) + '%'; segment.style.background = EV.fill({dem: 'D', rep: 'R', other: 'O'}[key]); segment.setAttribute('aria-hidden', 'true'); bar.append(segment);
    });
    const flow = $('.p28-flow'); flow.replaceChildren();
    r.rows.forEach((row) => {
      const tr = flow.insertRow(); [row.label, n(row.voters), n(row.dem), n(row.rep), n(row.other), row.nonreturners == null ? 'Not modeled as an eligible pool' : n(row.nonreturners)].forEach((text) => { tr.insertCell().textContent = text; });
    });
    const alternatives = $('.p28-alternatives'); alternatives.replaceChildren();
    [['Current settings', settings.demReturn, settings.repReturn], ['2020 approximate return pattern', 90, 90], ['2024 return pattern', 85, 89], ['Reverse 2024 return advantage', 89, 85]].forEach(([label, d, t]) => {
      const result = PresidentialModel.build(data(), {...settings, demReturn: d, repReturn: t}).result;
      const tr = alternatives.insertRow(); [label, p(d), p(t), result.margin == null ? 'No votes' : EV.fmtM(result.margin), n(result.totals.voters)].forEach((text) => { tr.insertCell().textContent = text; });
    });
    const jl = dash.data('jl_partners');
    if (jl.status === 'ok') {
      const T = 100 - jl.data.trump_outcomes.find((r) => r.label === 'Stayed home').value, H = 100 - jl.data.harris_stayed_home;
      try {
        const hr = PresidentialModel.comebackRate(H, settings.midtermVoterReturn, settings.midtermDropoffReturn);
        const tr = PresidentialModel.comebackRate(T, settings.midtermVoterReturn, settings.midtermDropoffReturn);
        write('comeback', `Implied 2028 return turnout: ${p(hr)} of Harris 2024 voters and ${p(tr)} of Trump 2024 voters.`);
        $('[data-p28-action="comeback"]').disabled = false;
      } catch (error) { write('comeback', error.message); $('[data-p28-action="comeback"]').disabled = true; }
    } else {
      write('comeback', jl.status === 'error' ? 'J.L. Partners reference unavailable; the main scenario still works.' : 'Loading J.L. Partners reference…');
      $('[data-p28-action="comeback"]').disabled = true;
    }
  });
  document.querySelectorAll('[data-p28-setting]').forEach((input) => input.addEventListener('input', () => {
    if (!settings) return;
    $('#p28-action-status').textContent = '';
    settings[input.dataset.p28Setting] = input.value === '' ? NaN : +input.value;
    if (['demReturn', 'repReturn'].includes(input.dataset.p28Setting)) markCustom();
    if (['entrantDem', 'entrantOther'].includes(input.dataset.p28Setting)) $('#p28-entrant-pattern').value = 'custom';
    redraw();
  }));
  $('#p28-turnout-pattern').addEventListener('change', (event) => {
    if (!settings || event.target.value === 'custom') return;
    const rates = {equal: [90, 90], pew2024: [85, 89], reversed: [89, 85]}[event.target.value];
    [settings.demReturn, settings.repReturn] = rates; redraw();
    $('#p28-action-status').textContent = 'Changed return turnout only. Vote choices and new/returning voters are unchanged.';
  });
  $('#p28-entrant-pattern').addEventListener('change', (event) => {
    if (!settings || event.target.value === 'custom') return;
    const row = data().entrants.find((r) => String(r.year) === event.target.value);
    Object.assign(settings, {entrantDem: row.dem, entrantOther: row.other}); redraw();
    $('#p28-action-status').textContent = 'Changed the new/returning voter mix only; their assumed number is unchanged.';
  });
  document.querySelectorAll('[data-p28-action]').forEach((button) => button.addEventListener('click', () => {
    if (!settings) return;
    $('#p28-action-status').textContent = '';
    const action = button.dataset.p28Action;
    if (action === 'reset') {
      settings = {...data().defaults}; $('#p28-turnout-pattern').value = 'equal'; $('#p28-entrant-pattern').value = 'custom'; redraw();
    } else if (action === 'switching') {
      const row = data().transitions.find((r) => r.to === 2024);
      Object.assign(settings, {demCross: 100 * row.dem_cross_party / row.dem_turnout, repCross: 100 * row.rep_cross_party / row.rep_turnout,
        demOther: 100 * (row.dem_turnout - row.dem_same_party - row.dem_cross_party) / row.dem_turnout,
        repOther: 100 * (row.rep_turnout - row.rep_same_party - row.rep_cross_party) / row.rep_turnout}); redraw();
      $('#p28-action-status').textContent = 'Applied conditional vote choices among returning voters from the rounded 2020–2024 Pew flows. Return turnout is unchanged.';
    } else if (action === 'comeback') {
      if (!EV.ok('jl_partners')) return;
      const jl = dash.data('jl_partners').data, t = 100 - jl.trump_outcomes.find((r) => r.label === 'Stayed home').value;
      settings.demReturn = PresidentialModel.comebackRate(100 - jl.harris_stayed_home, settings.midtermVoterReturn, settings.midtermDropoffReturn);
      settings.repReturn = PresidentialModel.comebackRate(t, settings.midtermVoterReturn, settings.midtermDropoffReturn); markCustom(); redraw();
      $('#p28-action-status').textContent = 'Applied the hypothetical midterm-comeback return rates only. This combines survey estimates with analyst assumptions; it does not track identified individuals.';
    } else if (action === 'save' && validScenario) {
      if (validScenario.result.margin == null) { $('#p28-action-status').textContent = 'Set a nonzero number of voters before saving a comparison.'; return; }
      const name = $('#p28-scenario-name').value.trim().slice(0, 80) || 'Scenario ' + (snapshots.length + 1);
      if (snapshots.length === 6) snapshots.shift();
      snapshots.push({name, settings: {...settings}, result: validScenario.result}); drawSnapshots();
      $('#p28-action-status').textContent = 'Saved for comparison in this page session (up to six scenarios).';
    } else if (action === 'export' && validScenario) {
      const payload = {model_version: 1, title: $('#p28-scenario-name').value.trim() || '2028 popular-vote scenario', source_checked_on: data().checked_on,
        base_2024: data().base_2024, assumptions: {...settings}, inputs: validScenario.inputs, result: validScenario.result, sources: data().sources,
        note: 'Hypothetical national popular vote; not a forecast or Electoral College estimate.'};
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'presidential-2028-scenario.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#p28-action-status').textContent = 'Exported assumptions, cohort inputs, results and source links.';
    }
  }));
})();
