const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/environment-model.js');
const data = require('../data/environment.json');
const polls = data.approval.filter((r) => r.cycle === 2026);
const settings = {cutoff: data.war_cutoff, target: data.election_day, months: 3, persistence: 0.5};

test('changing postwar observations cannot change the prewar projection', () => {
  const original = M.projectApproval(polls, settings);
  const modified = polls.map((r) => r.end >= data.war_cutoff ? {...r, approve: 99} : r);
  modified.push({start: '2026-02-27', end: '2026-03-02', approve: 99});
  assert.equal(M.projectApproval(modified, settings).value, original.value);
  assert.ok(original.selected.every((r) => r.end < data.war_cutoff));
  assert.equal(original.anchor.end, '2026-02-08');
});

test('flat, half and full slopes share a last-poll anchor and scale linearly', () => {
  const flat = M.projectApproval(polls, {...settings, persistence: 0});
  const half = M.projectApproval(polls, settings);
  const full = M.projectApproval(polls, {...settings, persistence: 1});
  assert.equal(flat.value, flat.anchor.approve);
  assert.equal(half.at(half.anchor.end), half.anchor.approve);
  assert.ok(Math.abs((half.value - flat.value) * 2 - (full.value - flat.value)) < 1e-10);
  assert.ok(half.value > 36 && half.value < 37);
});

test('approval gains move the D−R margin toward Republicans; zero sensitivity preserves results', () => {
  const s = M.approvalScenario(13.2, 40, 35, 1, 3);
  for (const [key, expected] of Object.entries({delta: -5, margin: 8.2, low: 5.2, high: 11.2})) assert.ok(Math.abs(s[key] - expected) < 1e-10);
  assert.equal(M.approvalScenario(13.2, 40, 35, 0).margin, 13.2);
  assert.equal(M.approvalScenario(13.2, 35, 35, 2).delta, 0);
  assert.ok(M.approvalScenario(13.2, 32, 35, 1).margin > 13.2);
});

test('no-Dobbs endpoints mean 1.2–2.2 points beyond the recorded R+2.8', () => {
  assert.ok(Math.abs(M.noDobbs(-2.8, 4).delta + 1.2) < 1e-10);
  assert.ok(Math.abs(M.noDobbs(-2.8, 5).delta + 2.2) < 1e-10);
  assert.equal(M.noDobbs(-2.8, 4.5).margin, -4.5);
  assert.throws(() => M.noDobbs(-2.8, 6.8));
});

test('scenario alternatives stay finite and bounded; invalid inputs fail explicitly', () => {
  for (const months of [3, 6, 12]) for (const persistence of [0, 0.5, 1]) {
    const p = M.projectApproval(polls, {...settings, months, persistence});
    assert.ok(Number.isFinite(p.value) && p.value >= 0 && p.value <= 100);
    const s = M.approvalScenario(13.2, p.value, 35, 2, 10);
    assert.ok(s.low <= s.margin && s.margin <= s.high);
  }
  assert.throws(() => M.projectApproval([], settings));
  assert.throws(() => M.approvalScenario(13.2, NaN, 35, 1));
});

test('race calls agree across result and simulator datasets', () => {
  const house = require('../data/house.json');
  const simHouse = require('../data/sim_house.json');
  assert.equal(house.length, 435);
  assert.equal(new Set(house.map((r) => r.seat)).size, 435);
  for (const r of house) assert.equal(simHouse.find((h) => h.seat === r.seat).actual, r.party, r.seat);
  const sim = require('../data/sim_races.json');
  for (const office of ['senate', 'governor']) {
    for (const r of require('../data/' + office + '_races.json')) {
      const s = sim.find((s) => s.office === office && s.race === r.race);
      assert.equal(s.actual, r.party, r.race);
      assert.equal(s.called, r.status === 'Called', r.race);
    }
  }
});

test('poll denominators and rounded raw values are preserved', () => {
  const jl = require('../data/jl_partners.json');
  assert.deepEqual(jl.trump_outcomes.map((r) => r.value), [52, 35, 8, 6]);
  assert.equal(jl.trump_outcomes.reduce((s, r) => s + r.value, 0), 101);
  assert.equal(jl.swing_decomposition.turnout + jl.swing_decomposition.switching, jl.swing_decomposition.total);
  assert.equal(jl.sample, 1000);
  assert.equal(jl.trump_sample, 486);
});
