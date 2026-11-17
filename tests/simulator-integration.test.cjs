const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../assets/environment-model.js');

function loadApp() {
  const calcs = {}, cache = {};
  const context = {
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
