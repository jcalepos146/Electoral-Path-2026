// Minimal runtime for the page's drawing code: loads data/*.json, runs computed
// datasets ("calcs"), and redraws elements marked data-draw when data arrives,
// when a hidden section is shown, or when the window is resized.
window.dash = (() => {
  const DATASETS = [
    'senate_races', 'senate_candidates', 'governor_races', 'governor_candidates', 'senate_holdovers',
    'voter_poll', 'state_tiles', 'house', 'county_shapes', 'pres_totals', 'sim_states',
    'counties', 'sim_house', 'sim_races', 'measures', 'state_turnout',
  ];
  const store = {};
  const calcs = {};
  const draws = {};
  const listeners = [];
  let pending = false;

  const load = (id) => {
    if (store[id]) return;
    store[id] = {status: 'loading', data: []};
    fetch('data/' + id + '.json')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { store[id] = {status: 'ok', data: d}; schedule(); })
      .catch((e) => { console.error('Failed to load', id, e); store[id] = {status: 'error', data: [], message: String(e)}; schedule(); });
  };

  const data = (id) => {
    const c = calcs[id];
    if (c) {
      if (c.cache) return c.cache;
      const ins = c.inputs.map(data);
      if (ins.some((x) => x.status === 'error')) return {status: 'error', data: []};
      if (ins.some((x) => x.status !== 'ok')) return {status: 'loading', data: []};
      try { c.cache = {status: 'ok', data: c.fn(...ins.map((x) => x.data))}; }
      catch (e) { console.error('Calculation failed', id, e); c.cache = {status: 'error', data: []}; }
      return c.cache;
    }
    if (!DATASETS.includes(id)) return {status: 'missing', data: []};
    load(id);
    return store[id];
  };

  const visible = (el) => !el.closest('[hidden]');
  const runEl = (el) => {
    const fn = draws[el.dataset.draw];
    if (!fn || !visible(el)) return;
    try { fn(el); } catch (e) { console.error('Drawing failed', el.dataset.draw, e); }
  };
  const drawAll = (root = document) => {
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    root.querySelectorAll('[data-draw]').forEach(runEl);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; drawAll(); });
  };

  // A section that stops being hidden gets its drawings run.
  new MutationObserver((muts) => {
    muts.forEach((m) => {
      const el = m.target;
      if (el.hidden) return;
      if (el.matches('[data-draw]')) runEl(el);
      el.querySelectorAll('[data-draw]').forEach(runEl);
    });
  }).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['hidden']});

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => drawAll(), 150); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => drawAll());

  return {
    data,
    calc: (id, def) => { calcs[id] = {inputs: def.inputs, fn: def.fn}; },
    loader: () => {},
    draw: (name, fn) => {
      if (fn) { draws[name] = fn; return; }
      document.querySelectorAll(`[data-draw="${name}"]`).forEach(runEl);
    },
    onData: (fn) => { listeners.push(fn); },
    setLink: (name) => { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    params: () => ({}),
    setParams: () => {},
    resetParams: () => {},
    refresh: () => {},
    colors: ['#3a6fd6', '#d4473d', '#1f8a83', '#8a68c9', '#c98a1f', '#5a8f3a', '#b04f86', '#6b7380'],
    start: () => schedule(),
  };
})();
