/* National presidential vote accounting. Inputs are assumptions, not forecasts. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.PresidentialModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const percent = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  function voteMix(row) {
    if (![row.dem, row.rep, row.other].every(percent) || Math.abs(row.dem + row.rep + row.other - 100) > 1e-7) throw new Error('Each group’s Democratic, Republican and other vote shares must sum to 100%.');
  }
  function evaluate({cohorts, entrants}) {
    if (!Array.isArray(cohorts) || !cohorts.length || cohorts.some((r) => typeof r.key !== 'string' || !r.key || r.key === 'entrants') || new Set(cohorts.map((r) => r.key)).size !== cohorts.length) throw new Error('Cohorts must have distinct keys separate from entrants.');
    const rows = cohorts.map((r) => {
      voteMix(r);
      if (!Number.isFinite(r.size) || r.size < 0 || !percent(r.returnRate)) throw new Error('Cohort sizes must be nonnegative and return rates must be 0–100%.');
      const voters = r.size * r.returnRate / 100;
      return {key: r.key, label: r.label, voters, nonreturners: r.size - voters,
        dem: voters * r.dem / 100, rep: voters * r.rep / 100, other: voters * r.other / 100};
    });
    voteMix(entrants);
    if (!Number.isFinite(entrants.voters) || entrants.voters < 0) throw new Error('New/returning voter volume must be nonnegative.');
    const existing = rows.reduce((sum, r) => ({dem: sum.dem + r.dem, rep: sum.rep + r.rep, other: sum.other + r.other}), {dem: 0, rep: 0, other: 0});
    rows.push({key: 'entrants', label: 'Did not cast a 2024 presidential vote', voters: entrants.voters, nonreturners: null,
      dem: entrants.voters * entrants.dem / 100, rep: entrants.voters * entrants.rep / 100, other: entrants.voters * entrants.other / 100});
    const totals = rows.reduce((s, r) => ({dem: s.dem + r.dem, rep: s.rep + r.rep, other: s.other + r.other, voters: s.voters + r.voters}), {dem: 0, rep: 0, other: 0, voters: 0});
    const shares = Object.fromEntries(['dem', 'rep', 'other'].map((k) => [k, totals.voters ? 100 * totals[k] / totals.voters : null]));
    const tieShare = entrants.voters ? (100 - entrants.other - 100 * (existing.dem - existing.rep) / entrants.voters) / 2 : null;
    return {rows, totals, shares, margin: totals.voters ? 100 * (totals.dem - totals.rep) / totals.voters : null,
      entrantTieShare: tieShare != null && tieShare >= 0 && tieShare <= 100 - entrants.other ? tieShare : null};
  }
  function build(data, settings) {
    const b = data.base_2024, s = settings;
    const inputs = {cohorts: [
      {key: 'harris24', label: '2024 Harris voters', size: b.dem, returnRate: s.demReturn, dem: 100 - s.demCross - s.demOther, rep: s.demCross, other: s.demOther},
      {key: 'trump24', label: '2024 Trump voters', size: b.rep, returnRate: s.repReturn, dem: s.repCross, rep: 100 - s.repCross - s.repOther, other: s.repOther},
      {key: 'other24', label: '2024 other / write-in voters', size: b.other, returnRate: s.otherReturn, dem: s.otherDem, rep: 100 - s.otherDem - s.otherOther, other: s.otherOther}],
      entrants: {voters: s.entrantMillions * 1e6, dem: s.entrantDem, rep: 100 - s.entrantDem - s.entrantOther, other: s.entrantOther}};
    return {inputs, result: evaluate(inputs)};
  }
  function comebackRate(midtermRate, voterReturn, nonvoterReturn) {
    if (![midtermRate, voterReturn, nonvoterReturn].every(percent)) throw new Error('Comeback rates must be 0–100%.');
    return (midtermRate * voterReturn + (100 - midtermRate) * nonvoterReturn) / 100;
  }
  return {evaluate, build, comebackRate};
});
