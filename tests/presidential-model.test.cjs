const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/presidential-model.js');
const data = require('../data/presidential_2028.json');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);

test('returning every 2024 voter with unchanged choices reproduces the FEC base', () => {
  const s = {...data.defaults, demReturn: 100, repReturn: 100, otherReturn: 100,
    demCross: 0, repCross: 0, demOther: 0, repOther: 0, otherDem: 0, otherOther: 100, entrantMillions: 0};
  const {result: r} = M.build(data, s), b = data.base_2024;
  close(r.totals.dem, b.dem); close(r.totals.rep, b.rep); close(r.totals.other, b.other); close(r.totals.voters, b.total);
  close(r.margin, 100 * (b.dem - b.rep) / b.total);
});

test('return turnout and within-returner choice use separate denominators', () => {
  const r = M.evaluate({cohorts: [{key: 'prior', size: 1000, returnRate: 85, dem: 79 / 85 * 100, rep: 5 / 85 * 100, other: 1 / 85 * 100}], entrants: {voters: 0, dem: 50, rep: 50, other: 0}});
  close(r.totals.voters, 850); close(r.totals.dem, 790); close(r.totals.rep, 50); close(r.totals.other, 10);
  close(r.rows[0].nonreturners, 150);
});

test('all modeled voters and vote destinations balance, including entrants and others', () => {
  for (const rates of [[90, 90], [85, 89], [89, 85], [0, 100], [100, 0]]) {
    const s = {...data.defaults, demReturn: rates[0], repReturn: rates[1]}, {result: r} = M.build(data, s);
    close(r.totals.dem + r.totals.rep + r.totals.other, r.totals.voters);
    close(r.shares.dem + r.shares.rep + r.shares.other, 100);
    close(r.rows.reduce((sum, row) => sum + row.voters, 0), r.totals.voters);
    assert.equal(new Set(r.rows.map((row) => row.key)).size, 4);
  }
});

test('new-voter mix changes only entrant votes; none of the 2026 margin is carried forward', () => {
  const a = M.build(data, data.defaults).result;
  const b = M.build({...data, house_2026_margin: 99}, {...data.defaults, entrantDem: 52, entrantOther: 4}).result;
  for (let i = 0; i < 3; i++) assert.deepEqual(a.rows[i], b.rows[i]);
  close(b.rows[3].dem, 25e6 * .52); close(b.rows[3].rep, 25e6 * .44);
  assert.deepEqual(M.build({...data, house_2026_margin: 99}, data.defaults).result, a);
});

test('break-even entrant share solves a tie when feasible', () => {
  const {result: a} = M.build(data, data.defaults);
  assert.notEqual(a.entrantTieShare, null);
  const b = M.build(data, {...data.defaults, entrantDem: a.entrantTieShare}).result;
  close(b.margin, 0);
  assert.equal(M.build(data, {...data.defaults, entrantMillions: 0}).result.entrantTieShare, null);
});

test('invalid percentages and overlapping cohorts are rejected; zero-vote scenario stays defined', () => {
  assert.throws(() => M.build(data, {...data.defaults, demCross: 99, demOther: 2}));
  assert.throws(() => M.build(data, {...data.defaults, demReturn: 101}));
  assert.throws(() => M.build(data, {...data.defaults, entrantMillions: -1}));
  assert.throws(() => M.build(data, {...data.defaults, entrantDem: 99, entrantOther: 3}));
  const {inputs} = M.build(data, data.defaults);
  assert.throws(() => M.evaluate({...inputs, cohorts: [inputs.cohorts[0], inputs.cohorts[0]]}));
  assert.throws(() => M.evaluate({...inputs, cohorts: [{...inputs.cohorts[0], key: 'entrants'}]}));
  const {result: r} = M.build(data, {...data.defaults, demReturn: 0, repReturn: 0, otherReturn: 0, entrantMillions: 0});
  assert.equal(r.totals.voters, 0); assert.equal(r.margin, null); assert.equal(r.shares.dem, null);
});

test('midterm-comeback assumptions partition prior cohorts instead of adding new voters', () => {
  close(M.comebackRate(78, 95, 80), 91.7);
  close(M.comebackRate(65, 95, 80), 89.75);
  close(M.comebackRate(78, 100, 100), 100);
  close(M.comebackRate(65, 0, 100), 35);
  assert.throws(() => M.comebackRate(78, NaN, 80));
  assert.throws(() => M.comebackRate(78, 101, 80));
});

test('historical references distinguish turnout from same-party retention and office types', () => {
  const flows = data.transitions.find((r) => r.to === 2024);
  assert.equal(flows.dem_turnout, 85); assert.equal(flows.dem_same_party, 79);
  assert.equal(flows.rep_turnout, 89); assert.equal(flows.rep_same_party, 85);
  const h08 = data.historical_results.find((r) => r.year === 2008 && r.office === 'House');
  const h10 = data.historical_results.find((r) => r.year === 2010 && r.office === 'House');
  close(h10.margin - h08.margin, -17.4);
  assert.equal(data.transitions[0].precision.startsWith('About'), true);
});
