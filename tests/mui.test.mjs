import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { source, wait } from './helpers.mjs';

function fixture() {
  const dom = new JSDOM('<button>Run</button><div data-testid="report-table-area"><button>view_column</button><div role="combobox">Cohort</div><div class="MuiDataGrid-root"></div></div>', { url: 'https://ads.applovin.com/analytics/reports?accountId=demo', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, doc = w.document, root = doc.querySelector('.MuiDataGrid-root');
  const columns = [{ field: 'day', headerName: 'Date' }, { field: 'conversions', headerName: 'Installs' }, { field: 'advRevenue', headerName: 'Spend' }, { field: 'chkaUsdRoas48hr', headerName: 'D1 IAP ROAS' }, { field: 'chkf48hr', headerName: 'D1 unique purchasers' }, { field: 'ret1d', headerName: 'D1 retention' }, { field: 'ret3d', headerName: 'D3 retention' }].map(c => ({ ...c, width: 100 }));
  const rows = [{ __rowId: 'row-0', day: '2026-10-01', conversions: '100', advRevenue: '1000', chkaUsdRoas48hr: '20', chkf48hr: '10', ret1d: '40', ret3d: '20' }];
  const total = { ...rows[0], __rowId: '__summary', __isAdsTableV2SummaryRow: true };
  let all = [...columns], pins = {}, props;
  const api = {
    state: { columns: { columnVisibilityModel: {} } },
    getAllColumns: () => all, getVisibleColumns: () => all.filter(c => api.state.columns.columnVisibilityModel[c.field] !== false),
    getColumn: f => all.find(c => c.field === f), getColumnIndex: f => all.findIndex(c => c.field === f),
    getRow: id => [...props.rows, ...props.pinnedRows.bottom].find(r => r.__rowId === id),
    getPinnedColumns: () => pins, setPinnedColumns: p => { pins = p; },
    setColumnVisibilityModel: model => { api.state.columns.columnVisibilityModel = model; },
    setColumnIndex: (f, index) => { const old = all.findIndex(c => c.field === f); const [c] = all.splice(old, 1); all.splice(index, 0, c); },
    updateColumns: defs => { for (const c of defs) { const i = all.findIndex(x => x.field === c.field); if (i < 0) all.push(c); else all[i] = { ...all[i], ...c }; } }
  };
  props = { columns, rows, pinnedRows: { bottom: [total] }, apiRef: { current: api }, loading: false };
  root.__reactFiber$test = { memoizedProps: props, return: null };
  const saved = {};
  w.chrome = { storage: { local: { get: async key => ({ [key]: saved[key] }), set: async x => Object.assign(saved, x) }, onChanged: { addListener() {}, removeListener() {} } } };
  for (const file of ['mui-runtime.js', 'mui.js', 'adapter.js', 'ui.js', 'content.js']) w.eval(source(file));
  const renderCells = () => {
    root.replaceChildren();
    const head = doc.createElement('div'); head.setAttribute('role', 'row');
    for (const c of api.getVisibleColumns()) { const cell = doc.createElement('div'); cell.setAttribute('role', 'columnheader'); cell.dataset.field = c.field; cell.textContent = c.headerName; head.append(cell); }
    root.append(head);
    for (const row of [...props.rows, ...props.pinnedRows.bottom]) {
      const el = doc.createElement('div'); el.setAttribute('role', 'row'); el.dataset.id = row.__rowId;
      for (const c of api.getVisibleColumns()) { const cell = doc.createElement('div'); cell.setAttribute('role', 'gridcell'); cell.dataset.field = c.field; cell.textContent = c.valueGetter ? c.valueGetter(null, row) : row[c.field]; el.append(cell); }
      root.append(el);
    }
  };
  return { w, doc, root, props, api, saved, renderCells, close() { w.ALX.stop(); w.ALX.stopMui(); w.close(); } };
}

test('MUI reads offscreen columns, computes percentage models, and keeps native virtualization', async () => {
  const f = fixture();
  try {
    await wait(450);
    assert.match(f.doc.querySelector('.alx-toolbar-button').textContent, /增强列 · [1-9]/);
    const derived = f.api.getVisibleColumns().filter(c => c.field.startsWith('__alx_'));
    assert.ok(derived.length > 4);
    const arppu = derived.find(c => /IAP ARPPU/.test(c.headerName));
    assert.equal(arppu.valueGetter(null, f.props.rows[0]), '≈ 20.00');
    assert.equal(arppu.valueGetter(null, f.props.pinnedRows.bottom[0]), '≈ 20.00');
    assert.equal(arppu.disableExport, true); assert.equal(arppu.sortable, false);
    assert.deepEqual([...f.api.getPinnedColumns().left], ['day']);
    assert.equal(f.root.style.display, '');
    assert.equal(f.doc.querySelectorAll('table').length, 0);
    f.renderCells(); await wait(350);
    assert.ok(f.root.querySelector('[data-id="row-0"] [data-field="conversions"]').style.backgroundColor);
    assert.equal(f.root.querySelector('[data-id="__summary"] [data-field="conversions"]').style.backgroundColor, '');
  } finally { f.close(); }
});

test('MUI keyboard reorders all columns, new primary dimensions stay left, and disabling restores native order', async () => {
  const f = fixture();
  try {
    await wait(450); f.renderCells(); await wait(350);
    const spend = f.root.querySelector('[role="columnheader"][data-field="advRevenue"]');
    spend.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
    await wait(350);
    assert.deepEqual(f.api.getVisibleColumns().slice(0,3).map(c => c.field), ['day', 'advRevenue', 'conversions']);
    const hour = { field: 'hour', headerName: 'Hour (UTC)', width: 100 };
    f.props.columns = [f.props.columns[0], hour, ...f.props.columns.slice(1)]; f.api.updateColumns([hour]);
    await wait(650);
    assert.deepEqual(f.api.getVisibleColumns().slice(0,4).map(c => c.field), ['day', 'hour', 'advRevenue', 'conversions']);
    f.w.ALX.stop();
    assert.deepEqual(f.api.getVisibleColumns().slice(0,4).map(c => c.field), ['day', 'hour', 'conversions', 'advRevenue']);
    assert.deepEqual(f.api.getPinnedColumns(), {});
  } finally { f.close(); }
});

test('MUI real-time suspends calculations and grid replacement recovers without retaining old rows', async () => {
  const f = fixture();
  try {
    await wait(450);
    f.doc.querySelector('[role="combobox"]').textContent = 'Real time'; await wait(450);
    assert.equal(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')), false);
    f.doc.querySelector('[role="combobox"]').textContent = 'Cohort'; await wait(450);
    assert.ok(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')));
    const newRoot = f.root.cloneNode(false); newRoot.__reactFiber$test = { memoizedProps: f.props, return: null }; f.root.replaceWith(newRoot);
    f.props.rows = [{ ...f.props.rows[0], conversions: '0', chkf48hr: '' }]; await wait(650);
    const metric = f.api.getVisibleColumns().find(c => /ARPPU/.test(c.headerName));
    assert.equal(metric.valueGetter(null, f.props.rows[0]), '—');
    assert.match(f.doc.querySelector('.alx-toolbar-button').textContent, /增强列 · /);
  } finally { f.close(); }
});

test('MUI Run clears stale columns and recovers after identical results with a new row model', async () => {
  const f = fixture();
  try {
    await wait(450);
    f.doc.querySelector('button').click(); await wait(150);
    assert.equal(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')), false);
    f.props.rows = f.props.rows.map(r => ({ ...r })); await wait(650);
    assert.ok(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')));
    f.props.loading = true; await wait(450);
    assert.equal(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')), false);
    f.props.loading = false; await wait(650);
    assert.ok(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')));
  } finally { f.close(); }
});

test('MUI missing fields remove dependent metrics; mode and width settings persist; stop restores native grid', async () => {
  const f = fixture();
  try {
    await wait(450);
    f.props.columns = f.props.columns.filter(c => c.field !== 'chkf48hr');
    await wait(650);
    assert.equal(f.api.getVisibleColumns().some(c => /ARPPU/.test(c.headerName)), false);
    const m = f.api.getVisibleColumns().find(c => c.field.startsWith('__alx_'));
    f.doc.dispatchEvent(new f.w.CustomEvent('alx:mui:width', { detail: JSON.stringify({ id: m.field.slice(6), width: 180 }) }));
    await wait(350); assert.equal(f.api.getColumn(m.field).width, 180);
    f.doc.querySelector('.alx-display-mode').click(); await wait(350);
    assert.match(f.doc.querySelector('.alx-display-mode').textContent, /按周期/);
    f.w.ALX.stop();
    assert.equal(f.api.getVisibleColumns().some(c => c.field.startsWith('__alx_')), false);
    assert.deepEqual(f.api.getPinnedColumns(), {});
  } finally { f.close(); }
});

test('enhanced CSV includes offscreen selected metrics and Total; unavailable while loading', async () => {
  const f = fixture();
  try {
    let output = '', downloads = 0;
    f.w.Blob = class { constructor(parts) { this.text = parts.join(''); } };
    f.w.URL.createObjectURL = blob => { output = blob.text; return 'blob:test'; };
    f.w.URL.revokeObjectURL = () => {};
    f.w.HTMLAnchorElement.prototype.click = function () { downloads++; assert.equal(this.download, 'applovin-enhanced.csv'); };
    await wait(450);
    f.doc.querySelector('[data-alx-owned="export"]').click();
    assert.equal(downloads, 1);
    assert.match(output, /D1 IAP ARPPU/);
    assert.match(output, /≈ 20.00/);
    assert.match(output, /"Total"/);
    assert.match(output, /"40%"/);
    assert.equal(output.split('\r\n').length, 3);
    f.props.loading = true;
    f.doc.querySelector('[data-alx-owned="export"]').click();
    assert.equal(downloads, 1);
    assert.equal(f.doc.querySelector('[data-alx-owned="export"]'), null);
  } finally { f.close(); }
});
