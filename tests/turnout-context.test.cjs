const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/environment-model.js');
const data = require('../data/turnout_context.json');

test('New Jersey arithmetic matches official totals and separates denominators', () => {
  const c = M.njComparison(data.nj);
  assert.equal(c.demIncrease, 557139);
  assert.equal(c.repIncrease, 162520);
  assert.ok(Math.abs(c.demRatio - 85.405) < .01);
  assert.ok(Math.abs(c.repRatio - 72.03) < .01);
  assert.equal(c.turnout2021.toFixed(2), '40.47');
  assert.equal(c.turnout2025.toFixed(2), '51.44');
  assert.equal(c.counterfactualRepShare.toFixed(2), '51.04');
  assert.equal(c.counterfactualTotal, data.nj.governor_2021.dem + data.nj.governor_2025.rep + data.nj.governor_2021.other_listed);
  assert.notEqual(c.counterfactualTotal, data.nj.turnout_2021.ballots);
  assert.ok(data.nj.governor_2025.dem + data.nj.governor_2025.rep + data.nj.governor_2025.other_listed < data.nj.turnout_2025.ballots);
});

test('Pew reversed-gap reference uses 4 points without treating NJ vote ratios as cohort turnout', () => {
  assert.equal(data.pew_2022.trump2020_turnout - data.pew_2022.biden2020_turnout, 4);
  const a = M.turnoutAtGap({demSize: 60, repSize: 40, demRate: 80, repRate: 60, gap: 4});
  assert.equal(a.demRate, 73.6);
  assert.equal(a.repRate, 69.6);
  assert.ok(Math.abs(a.demRate - a.repRate - 4) < 1e-10);
  assert.equal(a.combinedVoters, 72);
  assert.ok(Math.abs((60 * a.demRate + 40 * a.repRate) / 100 - 72) < 1e-10);
});

test('equal and negative gaps remain feasible while impossible rates fail explicitly', () => {
  const inputs = {demSize: 80, repSize: 20, demRate: 80, repRate: 60};
  const equal = M.turnoutAtGap({...inputs, gap: 0});
  assert.equal(equal.demRate, equal.repRate);
  const republican = M.turnoutAtGap({...inputs, gap: -4});
  assert.ok(republican.repRate > republican.demRate);
  assert.equal(republican.combinedVoters, equal.combinedVoters);
  assert.throws(() => M.turnoutAtGap({...inputs, gap: 100}));
  assert.throws(() => M.turnoutAtGap({...inputs, demSize: 0, gap: 4}));
});
