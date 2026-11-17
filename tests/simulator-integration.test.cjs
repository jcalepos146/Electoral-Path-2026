const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../assets/environment-model.js');

function loadApp() {
  const calcs = {}, cache = {};
  const context = {
    EnvironmentModel: M,
    dash: {
      calc: (name, definition) => { calcs[name] = definition; },
      draw: () => {}, start: () => {},
      data: (id) => {
        if (!cache[id]) {
          const c = calcs[id];
          cache[id] = {status: 'ok', data: c ? c.fn(...c.inputs.map((key) => context.dash.data(key).data)) : JSON.parse(fs.readFileSync(path.join(__dirname, '../data', id + '.json'), 'utf8'))};
        }
        return cache[id];
      },
    },
    document: {querySelectorAll: () => []},
    addEventListener: () => {}, location: {hash: ''},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8'), context);
  return context;
}

test('simulator starts from the counted House margin and preserves seat totals', () => {
  const app = loadApp(), S = app.EV.simDefaults(), R = app.EV.simRun(S);
  const expected = app.dash.data('national_env').data.find((r) => r.key === 'nat26').value;
  assert.equal(R.nat, expected);
  assert.equal(R.actualNat, expected);
  assert.equal(R.hD + R.hR, 435);
  assert.equal(R.sD + R.sR, 100);
  assert.equal(R.gD + R.gI + R.gR, 36);
  assert.equal([...R.races, ...R.house].filter((r) => r.called && r.changed).length, 0);
});

test('reversed-2022 turnout gap preserves combined participation and moves 2026 closer', () => {
  const app = loadApp(), s = app.EV.turnoutGapScenario(4), S = app.EV.simDefaults();
  const year = app.dash.data('pres_totals').data.find((r) => r.year === 2024);
  assert.ok(Math.abs(s.S.hd - s.S.tr - 4) < 1e-10);
  assert.ok(Math.abs((year.dem * s.S.hd + year.rep * s.S.tr) - (year.dem * S.hd + year.rep * S.tr)) < 1e-5);
  assert.equal(s.S.env, 0);
  assert.equal(s.S.appr, S.appr);
  assert.equal(s.S.nv, S.nv);
  assert.equal(s.S.year, 24);
  assert.ok(s.result.nat < s.base.nat && s.result.nat > 0);
  assert.ok(s.result.hD <= s.base.hD);
  assert.equal(s.result.hD + s.result.hR, 435);
  const unchanged = app.EV.turnoutGapScenario(S.hd - S.tr);
  assert.ok(Math.abs(unchanged.result.nat - s.base.nat) < 1e-10);
});

test('applying just the counterfactual margin shift matches the environment calculation', () => {
  const app = loadApp(), data = app.dash.data('environment').data;
  const actual = app.dash.data('national_env').data.find((r) => r.key === 'nat26').value;
  const p = M.projectApproval(data.approval.filter((r) => r.cycle === 2026), {cutoff: data.war_cutoff, target: data.election_day, months: 3, persistence: 0.5});
  const scenario = M.approvalScenario(actual, p.value, 35, 1);
  const S = app.EV.simDefaults(); S.env = scenario.delta;
  const result = app.EV.simRun(S);
  assert.ok(Math.abs(result.nat - scenario.margin) < 1e-10);
  const base = app.EV.simRun(app.EV.simDefaults());
  assert.ok(result.hD <= base.hD);
});
