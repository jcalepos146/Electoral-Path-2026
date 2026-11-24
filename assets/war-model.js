/* Pure calculations for candidate WAR, vote retention and turnout calibration checks.
   Margins are Democratic (or main non-Republican) minus Republican, in points of all votes. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.WarModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const r1 = (v) => Math.round(10 * v) / 10;
  const LOPSIDED = 30, REBOUND = -8, UNCONTESTED = 95;

  // Sum district presidential votes to states, so state baselines use the same source as districts.
  function statePresidential(districts) {
    const out = new Map();
    for (const d of districts) {
      const s = out.get(d.st) || {st: d.st, harris: 0, trump: 0, total: 0};
      s.harris += d.harris; s.trump += d.trump; s.total += d.total; out.set(d.st, s);
    }
    for (const s of out.values()) s.margin = (100 * (s.harris - s.trump)) / s.total;
    return out;
  }

  // WAR = actual margin - (2024 presidential margin of the seat + national swing).
  // Positive: the Democratic or independent challenger beat the baseline. Negative: the Republican did.
  function warRows({simRaces, simHouse, house, districts, nat24, nat26}) {
    const swing = nat26 - nat24, states = statePresidential(districts);
    const dist = new Map(districts.map((d) => [d.seat, d]));
    const houseInfo = new Map(house.map((h) => [h.seat, h]));
    const rows = [];
    for (const r of simRaces) {
      const base = states.get(r.st)?.margin;
      if (base == null) continue;
      const flags = [];
      if (r.chal_p === 'I' || r.chal_p === 'O') flags.push('independent');
      if (r.st === 'AK') flags.push('rcv');
      if (Math.abs(base) >= LOPSIDED) flags.push('lopsided');
      rows.push(row({office: r.office, race: r.race, st: r.st, chal: r.chal, chalParty: r.chal_p, rep: r.rep,
        margin: r.margin, actual: r.actual, base, swing, flags}));
    }
    for (const h of simHouse) {
      const d = dist.get(h.seat), info = houseInfo.get(h.seat) || {};
      if (!d) continue;
      const flags = [];
      const cands = info.candidates || '';
      const contested = /\(D\)/.test(cands) && /\(R\)/.test(cands) && Math.abs(h.margin) < UNCONTESTED;
      if (!contested) flags.push('uncontested');
      if (h.seat === 'AK-AL') flags.push('rcv', 'independent');
      if (Math.abs(d.margin) >= LOPSIDED) flags.push('lopsided');
      if (d.margin20 != null && d.margin - d.margin20 <= REBOUND) flags.push('rebound');
      rows.push(row({office: 'house', race: h.seat, st: h.st, chal: '', chalParty: h.seat === 'AK-AL' ? 'I' : 'D', rep: '',
        candidates: cands, margin: h.margin, actual: h.actual, base: d.margin, swing, flags}));
    }
    return rows;
  }
  function row(o) {
    const expected = o.base + o.swing;
    return {...o, expected, war: o.margin - expected, contested: !o.flags.includes('uncontested')};
  }

  // Shift every margin by the same amount so the national environment equals nat24 + swingFrom2024.
  function normalMidterm(rows, {nat24, nat26, swingFrom2024}) {
    const shift = nat24 + swingFrom2024 - nat26;
    return rows.map((r) => {
      const m = r.margin + shift;
      const side = m > 0 ? (r.chalParty === 'I' ? 'I' : r.chalParty === 'O' ? 'O' : 'D') : 'R';
      const actualSide = r.margin > 0 ? (r.chalParty === 'I' ? 'I' : r.chalParty === 'O' ? 'O' : 'D') : 'R';
      return {...r, cfMargin: m, cfSide: side, actualSide, changes: side !== actualSide};
    });
  }

  // Summaries skip uncontested seats; the uncontested margin says nothing about the candidates.
  function summarize(rows) {
    const c = rows.filter((r) => r.contested);
    if (!c.length) return {n: 0, mean: null, median: null};
    const w = c.map((r) => r.war).sort((a, b) => a - b), mid = Math.floor(w.length / 2);
    return {n: c.length, excluded: rows.length - c.length, mean: w.reduce((a, b) => a + b, 0) / w.length,
      median: w.length % 2 ? w[mid] : (w[mid - 1] + w[mid]) / 2};
  }

  // 2026 votes for each party's nominee as a share of that party's 2024 presidential vote in the state.
  function retention(candidates, races, districts) {
    const states = statePresidential(districts), out = [];
    for (const race of races) {
      const st = states.get(race.st), cs = candidates.filter((c) => c.race === race.race && c.votes != null);
      if (!st || !cs.length) continue;
      const by = (p) => cs.filter((c) => c.party === p).reduce((a, c) => a + c.votes, 0);
      const dem = by('D'), ind = by('I'), rep = by('R');
      // Where an independent, not a Democrat, was the main challenger, compare the independent with Harris.
      const challenger = dem >= ind ? {party: 'D', votes: dem} : {party: 'I', votes: ind};
      if (!rep || !challenger.votes) continue;
      out.push({race: race.race, st: race.st, winner: race.party, challengerParty: challenger.party,
        challengerVotes: challenger.votes, repVotes: rep, harris: st.harris, trump: st.trump,
        challengerShare: (100 * challenger.votes) / st.harris, repShare: (100 * rep) / st.trump,
        gap: (100 * challenger.votes) / st.harris - (100 * rep) / st.trump});
    }
    return out;
  }

  // National accounting check for a turnout assumption. Rates are percentages.
  // harrisTurnout, trumpTurnout: share of each 2024 cohort that voted in the 2026 House race.
  // harrisToRep, trumpToDem: among those who voted, the share that crossed over. Remaining non-major-party
  // shares are other votes. Votes not explained by the two cohorts come from 2024 third-party voters and
  // 2024 nonvoters, split by restDem/restRep.
  function calibrationCheck({harris, trump, counted, harrisTurnout, trumpTurnout, harrisToRep, trumpToDem,
    harrisOther = 1, trumpOther = 2, restDem = 70, restRep = 25, restPool}) {
    const vals = [harrisTurnout, trumpTurnout, harrisToRep, trumpToDem, harrisOther, trumpOther, restDem, restRep];
    if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return {valid: false, reason: 'Rates must be between 0 and 100.'};
    if (harrisToRep + harrisOther > 100 || trumpToDem + trumpOther > 100 || restDem + restRep > 100) return {valid: false, reason: 'Vote shares within a group add up to more than 100.'};
    const hv = (harris * harrisTurnout) / 100, tv = (trump * trumpTurnout) / 100;
    const rest = counted.total - hv - tv;
    const dem = hv * (100 - harrisToRep - harrisOther) / 100 + tv * trumpToDem / 100 + Math.max(rest, 0) * restDem / 100;
    const rep = hv * harrisToRep / 100 + tv * (100 - trumpToDem - trumpOther) / 100 + Math.max(rest, 0) * restRep / 100;
    const margin = (100 * (dem - rep)) / counted.total, countedMargin = (100 * (counted.dem - counted.rep)) / counted.total;
    return {valid: true, feasible: rest >= 0, cohortVotes: hv + tv, rest, restRate: restPool ? (100 * rest) / restPool : null,
      dem, rep, margin, countedMargin, miss: margin - countedMargin, demMiss: dem - counted.dem, repMiss: rep - counted.rep};
  }

  return {statePresidential, warRows, normalMidterm, summarize, retention, calibrationCheck, r1,
    thresholds: {LOPSIDED, REBOUND, UNCONTESTED}};
});
