/* Pure scenario calculations. Margins are Democratic minus Republican, in points. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.EnvironmentModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const month = 365.25 / 12 * 86400000;
  const date = (s) => Date.parse(s + 'T00:00:00Z');
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function projectApproval(rows, {cutoff, target, months = 3, persistence = 0.5}) {
    if (![3, 6, 12].includes(months) || ![0, 0.5, 1].includes(persistence)) throw new Error('Invalid trend settings');
    const cut = date(cutoff), end = date(target);
    if (!Number.isFinite(cut) || !Number.isFinite(end) || end < cut) throw new Error('Invalid scenario dates');
    const start = new Date(cut); start.setUTCMonth(start.getUTCMonth() - months);
    // A poll crossing the intervention date cannot enter the counterfactual fit.
    const selected = rows.filter((r) => date(r.end) < cut && date(r.start) >= +start && Number.isFinite(r.approve))
      .slice().sort((a, b) => date(a.end) - date(b.end));
    if (selected.length < 2) throw new Error('At least two pre-event polls are required');
    const anchor = selected.at(-1), t0 = date(anchor.end);
    const points = selected.map((r) => ({x: (date(r.end) - t0) / month, y: r.approve}));
    const avg = (key) => points.reduce((s, p) => s + p[key], 0) / points.length;
    const mx = avg('x'), my = avg('y');
    const denominator = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    if (!denominator) throw new Error('Pre-event polls must have distinct field dates');
    const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denominator;
    const at = (day) => clamp(anchor.approve + slope * persistence * ((date(day) - t0) / month), 0, 100);
    return {selected, anchor, slope, value: at(target), at};
  }
  function approvalScenario(actualMargin, projected, observed, coefficient, uncertainty = 3) {
    if (![actualMargin, projected, observed, coefficient, uncertainty].every(Number.isFinite) || coefficient < 0 || uncertainty < 0) throw new Error('Invalid approval assumptions');
    const delta = -coefficient * (projected - observed);
    const margin = clamp(actualMargin + delta, -100, 100);
    return {delta: margin - actualMargin, margin,
      low: clamp(actualMargin - coefficient * (clamp(projected + uncertainty, 0, 100) - observed), -100, 100),
      high: clamp(actualMargin - coefficient * (clamp(projected - uncertainty, 0, 100) - observed), -100, 100)};
  }
  function noDobbs(actualMargin, republicanMargin) {
    if (!Number.isFinite(actualMargin) || !Number.isFinite(republicanMargin) || republicanMargin < 4 || republicanMargin > 5) throw new Error('No-Dobbs assumption must be R+4 to R+5');
    return {margin: -republicanMargin, delta: -republicanMargin - actualMargin};
  }
  function njComparison(nj) {
    const a = nj.governor_2021, b = nj.governor_2025, p = nj.president_2024;
    const values = [a.dem, a.rep, a.other_listed, b.dem, b.rep, b.other_listed, p.dem, p.rep,
      nj.turnout_2021.ballots, nj.turnout_2021.registered, nj.turnout_2025.ballots, nj.turnout_2025.registered];
    if (!values.every((v) => Number.isFinite(v) && v >= 0) || !p.dem || !p.rep || !nj.turnout_2021.registered || !nj.turnout_2025.registered) throw new Error('Invalid New Jersey vote counts');
    const counterfactualTotal = a.dem + b.rep + a.other_listed;
    return {demIncrease: b.dem - a.dem, repIncrease: b.rep - a.rep,
      demGrowth: 100 * (b.dem / a.dem - 1), repGrowth: 100 * (b.rep / a.rep - 1),
      demRatio: 100 * b.dem / p.dem, repRatio: 100 * b.rep / p.rep,
      turnout2021: 100 * nj.turnout_2021.ballots / nj.turnout_2021.registered,
      turnout2025: 100 * nj.turnout_2025.ballots / nj.turnout_2025.registered,
      counterfactualTotal, counterfactualRepShare: 100 * b.rep / counterfactualTotal,
      margin2025: 100 * (b.dem - b.rep) / (b.dem + b.rep + b.other_listed)};
  }
  function turnoutAtGap({demSize, repSize, demRate, repRate, gap}) {
    if (![demSize, repSize, demRate, repRate, gap].every(Number.isFinite) || demSize <= 0 || repSize <= 0 || demRate < 0 || demRate > 100 || repRate < 0 || repRate > 100) throw new Error('Invalid turnout inputs');
    const combinedVoters = (demSize * demRate + repSize * repRate) / 100;
    const mean = combinedVoters * 100 / (demSize + repSize);
    // Solve d−r=gap while preserving D*d + R*r, with rates in percent.
    const nextDem = mean + gap * repSize / (demSize + repSize);
    const nextRep = mean - gap * demSize / (demSize + repSize);
    if (nextDem < 0 || nextDem > 100 || nextRep < 0 || nextRep > 100) throw new Error('Requested gap requires turnout outside 0–100%');
    return {demRate: nextDem, repRate: nextRep, combinedVoters, gap};
  }
  return {projectApproval, approvalScenario, noDobbs, njComparison, turnoutAtGap};
});
