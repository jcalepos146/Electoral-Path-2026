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
  return {projectApproval, approvalScenario, noDobbs};
});
