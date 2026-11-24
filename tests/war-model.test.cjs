const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../assets/war-model.js');
const load = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', n + '.json'), 'utf8'));

const pres = load('pres_totals').find((r) => r.year === 2024), counted = load('results_meta').house_counts;
const nat24 = (100 * (pres.dem - pres.rep)) / pres.total, nat26 = (100 * (counted.dem - counted.rep)) / counted.total;
const rows = W.warRows({simRaces: load('sim_races'), simHouse: load('sim_house'), house: load('house'), districts: load('district_pres24').districts, nat24, nat26});

test('WAR is the margin minus the seat baseline plus the national swing', () => {
  for (const r of rows) assert.ok(Math.abs(r.war - (r.margin - r.base - (nat26 - nat24))) < 1e-9);
  assert.equal(rows.filter((r) => r.office === 'house').length, 435);
  assert.equal(rows.filter((r) => r.office !== 'house').length, load('sim_races').length);
});

test('uncontested seats are flagged and left out of summaries', () => {
  const house = rows.filter((r) => r.office === 'house'), s = W.summarize(house);
  assert.ok(house.some((r) => !r.contested));
  assert.equal(s.n + s.excluded, 435);
  for (const r of house.filter((x) => Math.abs(x.margin) >= 95)) assert.equal(r.contested, false);
});

test('Alaska House is scored against the independent after ranked-choice counting', () => {
  const ak = rows.find((r) => r.race === 'AK-AL');
  assert.equal(ak.chalParty, 'I');
  assert.ok(ak.flags.includes('rcv'));
  assert.ok(Math.abs(ak.war) < 15, 'WAR should no longer reflect the Democrat who finished third');
});

test('a normal-midterm swing shifts every margin by the same amount and keeps the actual result at full swing', () => {
  const same = W.normalMidterm(rows, {nat24, nat26, swingFrom2024: nat26 - nat24});
  assert.equal(same.filter((r) => r.changes).length, 0);
  const seven = W.normalMidterm(rows, {nat24, nat26, swingFrom2024: 7});
  const shift = nat24 + 7 - nat26;
  seven.forEach((r) => assert.ok(Math.abs(r.cfMargin - r.margin - shift) < 1e-9));
  assert.ok(seven.filter((r) => r.office === 'senate' && r.changes).every((r) => r.cfSide === 'R'));
});

test('state baselines sum district votes', () => {
  const st = W.statePresidential(load('district_pres24').districts);
  assert.equal(st.size, 50);
  assert.ok(Math.abs(st.get('TX').harris - 4835250) < 500);
});

test('retention compares nominee votes with the party’s 2024 presidential vote', () => {
  const ret = W.retention(load('senate_candidates'), load('senate_races'), load('district_pres24').districts);
  const tx = ret.find((r) => r.st === 'TX'), ia = ret.find((r) => r.st === 'IA');
  assert.equal(Math.round(tx.challengerShare), 113); assert.equal(Math.round(tx.repShare), 66);
  assert.equal(Math.round(ia.challengerShare), 97); assert.equal(Math.round(ia.repShare), 68);
  assert.equal(ret.find((r) => r.st === 'NE').challengerParty, 'I');
});

test('calibration check conserves votes and flags impossible turnout', () => {
  const base = {harris: pres.dem, trump: pres.rep, counted, harrisToRep: 2, trumpToDem: 7};
  const ok = W.calibrationCheck({...base, harrisTurnout: 78, trumpTurnout: 65});
  assert.ok(ok.valid && ok.feasible);
  assert.ok(Math.abs(ok.cohortVotes + ok.rest - counted.total) < 1e-3);
  assert.ok(Math.abs(ok.miss) < 1.5, 'J.L. Partners turnout with voter-poll choices should be near the count');
  const inferred = W.calibrationCheck({...base, harrisTurnout: 78.5, trumpTurnout: 68.4});
  assert.ok(inferred.miss < ok.miss, 'higher Trump turnout moves the modeled margin toward Republicans');
  assert.equal(W.calibrationCheck({...base, harrisTurnout: 100, trumpTurnout: 100}).feasible, false);
  assert.equal(W.calibrationCheck({...base, harrisTurnout: 120, trumpTurnout: 65}).valid, false);
});
