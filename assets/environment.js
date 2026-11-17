/* Historical environment, counterfactual controls and separately sourced turnout evidence. */
(() => {
  const M = window.EnvironmentModel;
  const state = {months: 3, persistence: 0.5, coefficient: 1, uncertainty: 3, dobbs: 4.5, metric: 'approve'};
  const f = (n) => d3.format('.1f')(n);
  const dateLabel = (date) => new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}).format(new Date(date + 'T00:00:00Z'));
  const get = () => EV.ok('environment', 'national_env') ? dash.data('environment').data : null;
  const margin = () => dash.data('national_env').data.find((r) => r.key === 'nat26').value;
  const write = (root, key, value) => root.querySelectorAll(`[data-env-value="${key}"]`).forEach((el) => { el.textContent = value; });
  function scenario(data, settings = state) {
    const rows = data.approval.filter((r) => r.cycle === 2026);
    const projection = M.projectApproval(rows, {cutoff: data.war_cutoff, target: data.election_day, months: settings.months, persistence: settings.persistence});
    const reference = rows.filter((r) => r.end <= data.election_day).at(-1);
    return {projection, reference, ...M.approvalScenario(margin(), projection.value, reference.approve, settings.coefficient, settings.uncertainty)};
  }
  function sourceLink(parent, label, url) {
    const a = document.createElement('a'); a.textContent = label; a.href = url; parent.append(a);
  }
  dash.draw('results-updates', (el) => {
    if (!EV.reset(el, ['results_meta'])) return;
    const meta = dash.data('results_meta').data;
    const p = document.createElement('p'); p.className = 'note';
    p.textContent = `Selected race calls checked ${dateLabel(meta.calls_checked_on)}; county counts as of ${dateLabel(meta.county_counts_as_of)}, national House counts as of ${dateLabel(meta.house_counts.as_of)}.`;
    if (meta.refresh_attempt.status === 'blocked') p.append(` Count refresh on ${dateLabel(meta.refresh_attempt.date)} was blocked by the provider (HTTP 403); earlier counts are retained.`);
    el.append(p);
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Latest verified updates and sources'; details.append(summary);
    const ul = document.createElement('ul');
    meta.updates.forEach((r) => { const li = document.createElement('li'); li.append(r.race + ': ' + r.detail + ' · '); sourceLink(li, 'Source', r.source_url); ul.append(li); });
    details.append(ul); el.append(details);
  });
  dash.draw('jl-evidence', (el) => {
    if (!EV.reset(el, ['jl_partners'])) return;
    const data = dash.data('jl_partners').data;
    const p = document.createElement('p'); p.className = 'note';
    p.textContent = 'Election Day survey of 1,000 registered voters; Trump 2024 subgroup n=486. Released Nov. 16, 2026. Percentages below include people who did not vote in 2026.'; el.append(p);
    data.trump_outcomes.forEach((row) => {
      const r = document.createElement('div'); r.className = 'evidence-row';
      const label = document.createElement('span'); label.textContent = row.label;
      const track = document.createElement('span'); track.className = 'evidence-track'; track.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('span'); bar.style.width = row.value + '%'; bar.style.background = EV.fill(row.party); track.append(bar);
      const value = document.createElement('b'); value.textContent = row.value + '%'; r.append(label, track, value); el.append(r);
    });
    const note = document.createElement('p'); note.className = 'note';
    note.textContent = 'Reported values total 101% because of rounding. “Other / no House vote” includes voters who skipped the House contest. Harris voters: 22% stayed home, versus 35% of Trump voters.'; el.append(note);
    const text = document.createElement('p'); text.className = 'note';
    text.textContent = 'J.L. Partners attributes 10 points of a rounded 15-point Democratic swing to turnout and 5 to switching. Its voter subsample is weighted to D+13. This is a descriptive decomposition, not a causal estimate of the war’s effect.'; el.append(text);
    const links = document.createElement('p'); links.className = 'note';
    sourceLink(links, 'J.L. Partners release', data.source_url); links.append(' · '); sourceLink(links, 'Full report', data.report_url); links.append(' · '); sourceLink(links, 'Data tables', data.tables_url); el.append(links);
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Survey methods and uncertainty'; details.append(summary);
    const method = document.createElement('p'); method.textContent = data.notes.at(-1) + ' The report checks its findings against 30,000+ campaign interviews. These rates use a different sample and denominator from the voter-only poll below, so they do not replace that dataset.'; details.append(method); el.append(details);
  });
  dash.draw('environment-summary', (el) => {
    if (!EV.reset(el, ['environment', 'national_env'])) return;
    const data = get();
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    ['Cycle', 'October before midterm year', 'February of midterm year', 'October of midterm year', 'House result'].forEach((label) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
    const body = table.createTBody();
    [2022, 2026].forEach((cycle) => {
      const rows = data.approval.filter((r) => r.cycle === cycle);
      const lastInMonth = (year, month) => rows.filter((r) => r.end.startsWith(year + '-' + month)).at(-1);
      const tr = body.insertRow(); tr.insertCell().textContent = cycle === 2022 ? '2021 → 2022 · Biden' : '2025 → 2026 · Trump';
      [lastInMonth(cycle - 1, '10'), lastInMonth(cycle, '02'), lastInMonth(cycle, '10')].forEach((r) => { const td = tr.insertCell(); td.textContent = `${r.approve}% approve / ${r.disapprove}% disapprove`; const sub = document.createElement('small'); sub.textContent = 'Through ' + r.end; td.append(sub); });
      tr.insertCell().textContent = cycle === 2022 ? EV.fmtM(data.house_2022_margin) : EV.fmtM(margin()) + ' (' + dateLabel(dash.data('results_meta').data.house_counts.as_of) + ' count)';
    });
    el.append(table);
  });
  dash.draw('approval-history', (el) => {
    if (!EV.reset(el, ['environment'])) return;
    const data = dash.data('environment').data, net = state.metric === 'net';
    const W = Math.max(300, el.clientWidth), H = 300, left = 38, right = 16;
    const x = d3.scaleLinear([0, 22.2], [left, W - right]), y = d3.scaleLinear(net ? [-45, 30] : [20, 70], [H - 42, 18]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'AP-NORC approval for Biden in 2021–2022 and Trump in 2025–2026, aligned by month of cycle. Data table follows.');
    const time = (r) => (Date.parse(r.end) - Date.UTC(r.cycle - 1, 0, 1)) / (365.25 / 12 * 86400000);
    const value = (r) => net ? r.approve - r.disapprove : r.approve;
    svg.append('g').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + (net ? '' : '%')));
    svg.append('g').attr('transform', `translate(0,${H - 42})`).call(d3.axisBottom(x).tickValues([0, 4, 8, 12, 16, 20]).tickFormat((v) => ['Jan Y1', 'May Y1', 'Sep Y1', 'Jan Y2', 'May Y2', 'Sep Y2'][v / 4]));
    svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(net ? 0 : 50)).attr('y2', y(net ? 0 : 50)).attr('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 4');
    const line = d3.line().x((r) => x(time(r))).y((r) => y(value(r)));
    [2022, 2026].forEach((cycle) => {
      const rows = data.approval.filter((r) => r.cycle === cycle), color = cycle === 2022 ? 'var(--ev-d)' : 'var(--ev-r)';
      svg.append('path').datum(rows).attr('d', line).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', cycle === 2026 ? '7 3' : null);
      svg.selectAll('.poll-' + cycle).data(rows).join('circle').attr('cx', (r) => x(time(r))).attr('cy', (r) => y(value(r))).attr('r', 3).attr('fill', color)
        .append('title').text((r) => `${r.start}–${r.end}: ${r.approve}% approve, ${r.disapprove}% disapprove`);
    });
    [[data.war_cutoff, 2026, 'Iran war'], [data.dobbs_date, 2022, 'Dobbs']].forEach(([day, cycle, label], i) => {
      const t = time({end: day, cycle});
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', 20).attr('y2', H - 42).attr('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '2 5');
      svg.append('text').attr('x', x(t) + 4).attr('y', 30 + i * 14).attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(label);
    });
    svg.selectAll('.domain,.tick line').attr('stroke', 'var(--color-border-line)'); svg.selectAll('.tick text').attr('fill', 'var(--color-fg-muted)');
  });
  dash.draw('approval-data', (tb) => {
    tb.replaceChildren(); if (!EV.ok('environment')) return;
    const data = dash.data('environment').data;
    data.approval.forEach((r) => {
      const tr = tb.insertRow(); [r.cycle, r.start + ' – ' + r.end, r.approve + '%', r.disapprove + '%', (r.approve - r.disapprove) + ' pts'].forEach((v) => { tr.insertCell().textContent = v; });
      sourceLink(tr.insertCell(), 'AP-NORC topline', data.sources[r.source].url);
    });
  });
  dash.draw('environment-sources', (el) => {
    if (!EV.reset(el, ['environment'])) return;
    Object.values(dash.data('environment').data.sources).forEach((s) => { const li = document.createElement('li'); sourceLink(li, s.label, s.url); el.append(li); });
  });
  dash.draw('counterfactual-values', (el) => {
    const data = get(); if (!data) { el.classList.toggle('dash-skeleton', !EV.failed('environment', 'national_env')); return; }
    el.classList.remove('dash-skeleton');
    const s = scenario(data), d = M.noDobbs(data.house_2022_margin, state.dobbs);
    const fields = {approval: f(s.projection.value) + '%', observed: s.reference.approve + '%', margin: EV.fmtM(s.margin), actual: EV.fmtM(margin()),
      shift: EV.fmtM(s.delta) + ' shift', sensitivity: `${EV.fmtM(s.low)} to ${EV.fmtM(s.high)}`, slope: f(s.projection.slope) + ' points/month',
      anchor: s.projection.anchor.end + ' · ' + s.projection.anchor.approve + '%', polls: String(s.projection.selected.length),
      window: s.projection.selected[0].start + ' to ' + s.projection.anchor.end, coefficient: f(state.coefficient), uncertainty: f(state.uncertainty),
      countDate: dateLabel(dash.data('results_meta').data.house_counts.as_of),
      dobbs: EV.fmtM(d.margin), dobbsActual: EV.fmtM(data.house_2022_margin), dobbsShift: f(Math.abs(d.delta)) + ' points toward Republicans'};
    Object.entries(fields).forEach(([k, v]) => write(el, k, v));
    const btn = el.querySelector('.apply-no-war'); if (btn) btn.disabled = !EV.ok(...EV.SIMDATA) || Math.abs(s.delta) > 20;
  });
  dash.draw('counterfactual-chart', (el) => {
    if (!EV.reset(el, ['environment', 'national_env'])) return;
    const data = get(), s = scenario(data), rows = data.approval.filter((r) => r.cycle === 2026);
    const W = Math.max(300, el.clientWidth), H = 250, left = 38;
    const x = d3.scaleUtc([new Date('2025-03-01T00:00:00Z'), new Date(data.election_day + 'T00:00:00Z')], [left, W - 16]);
    const y = d3.scaleLinear([0, Math.max(60, s.projection.value + state.uncertainty + 5)], [H - 35, 14]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Observed Trump approval and hypothetical no-war projection. Projected approval ${f(s.projection.value)} percent. Dashed line is hypothetical.`);
    svg.append('g').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + '%'));
    svg.append('g').attr('transform', `translate(0,${H - 35})`).call(d3.axisBottom(x).ticks(W < 500 ? 4 : 7).tickFormat(d3.utcFormat('%b %y')));
    const line = d3.line().x((r) => x(new Date(r.end + 'T00:00:00Z'))).y((r) => y(r.approve));
    svg.append('path').datum(rows).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--ev-r)').attr('stroke-width', 2);
    const projected = [{end: s.projection.anchor.end, approve: s.projection.anchor.approve}, {end: data.election_day, approve: s.projection.value}];
    svg.append('path').datum(projected).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--ev-t)').attr('stroke-width', 3).attr('stroke-dasharray', '7 4');
    rows.forEach((r) => { svg.append('circle').attr('cx', x(new Date(r.end + 'T00:00:00Z'))).attr('cy', y(r.approve)).attr('r', 3).attr('fill', 'var(--ev-r)').append('title').text(`${r.start}–${r.end}: ${r.approve}% approve`); });
    svg.append('line').attr('x1', x(new Date(data.war_cutoff))).attr('x2', x(new Date(data.war_cutoff))).attr('y1', 14).attr('y2', H - 35).attr('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '2 4');
    svg.selectAll('.domain,.tick line').attr('stroke', 'var(--color-border-line)'); svg.selectAll('.tick text').attr('fill', 'var(--color-fg-muted)');
  });
  dash.draw('counterfactual-sensitivity', (tb) => {
    tb.replaceChildren(); const data = get(); if (!data) return;
    [3, 6, 12].forEach((months) => {
      const tr = tb.insertRow(); tr.insertCell().textContent = months + ' months';
      [0, 0.5, 1].forEach((persistence) => {
        const s = scenario(data, {...state, months, persistence}); tr.insertCell().textContent = f(s.projection.value) + '% · ' + EV.fmtM(s.margin);
      });
    });
  });
  function redraw() { ['counterfactual-values', 'counterfactual-chart', 'counterfactual-sensitivity'].forEach((name) => dash.draw(name)); }
  document.querySelectorAll('[data-env-setting]').forEach((input) => {
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
      const key = input.dataset.envSetting; state[key] = key === 'metric' ? input.value : +input.value;
      if (key === 'metric') dash.draw('approval-history'); else redraw();
    });
  });
  document.querySelectorAll('.apply-no-war').forEach((button) => button.addEventListener('click', () => {
    const data = get(); if (!data || !EV.ok(...EV.SIMDATA)) return;
    const delta = scenario(data).delta;
    if (Math.abs(delta) > 20) return;
    EV.simS = {...EV.simDefaults(), env: delta};
    document.querySelectorAll('.sim-year').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.year === '24')));
    document.querySelectorAll('.y24').forEach((e) => { e.hidden = false; }); document.querySelectorAll('.y20').forEach((e) => { e.hidden = true; });
    document.querySelector('[data-tab="sim"]').click(); EV.simRedraw();
    document.getElementById('sim-scenario-note').textContent = 'No-Iran-war scenario applied as a national margin shift. Approval and turnout sliders reset to their baseline to avoid counting the same change twice.';
  }));
  document.querySelectorAll('.sim-in, .sim-reset, .sim-year').forEach((e) => e.addEventListener(e.matches('.sim-in') ? 'input' : 'click', () => {
    document.getElementById('sim-scenario-note').textContent = '';
  }));
})();
