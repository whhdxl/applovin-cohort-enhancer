import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, headers, values, removeColumn, wait } from './helpers.mjs';
test('split header/body, append widths and restore original DOM', () => {
  const f = fixture(); try {
    const snap = f.A.adapter.discover(f.doc); assert.equal(snap.ok, true); assert.equal(snap.mode, 'cohort');
    const render = f.A.adapter.renderer(f.doc), original = f.doc.querySelector('.arco-table').outerHTML;
    render.render(snap, { ...f.A.defaults(), autoSelect: false, selected: ['arppu.0', 'rpd.iap.0'] });
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, 2);
    assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.0"] span').textContent, '$10.00');
    for (const table of snap.tables) assert.equal(table.querySelectorAll('col').length, headers.length + 2);
    assert.equal(f.A.adapter.discover(f.doc).signature, snap.signature);
    render.reset(); assert.equal(f.doc.querySelector('.arco-table').outerHTML, original);
  } finally { f.close(); }
});
test('column hide/reorder uses current header identity; bad spans fail closed', () => {
  const f = fixture(); try {
    removeColumn(f.doc, headers.indexOf('D0 unique purchasers'));
    let snap = f.A.adapter.discover(f.doc); assert.equal(snap.ok, true);
    assert.equal(f.A.capability(f.A.byId.get('arppu.0'), snap.available).available, false);
    for (const tr of f.doc.querySelectorAll('tr')) tr.prepend(tr.lastElementChild);
    snap = f.A.adapter.discover(f.doc);
    assert.equal(f.A.calculate(f.A.byId.get('rpd.total.7'), snap.rows[0].values).value, 6);
    f.doc.querySelector('tbody td').colSpan = 2;
    assert.equal(f.A.adapter.discover(f.doc).ok, false);
  } finally { f.close(); }
});
test('native totals are recomputed rather than averaging row ratios', () => {
  const data = values.slice(); data[2] = '900'; data[5] = '$900'; data[6] = '30';
  const totals = values.slice(); totals[2] = '1000'; totals[5] = '$1000'; totals[6] = '40';
  const f = fixture({ rows: [values, data], total: totals }); try {
    const snap = f.A.adapter.discover(f.doc);
    assert.equal(f.A.calculate(f.A.byId.get('arppu.0'), snap.rows.at(-1).values).value, 25);
    const r = f.A.adapter.renderer(f.doc); r.render(snap, { ...f.A.defaults(), autoSelect: false, selected: ['arppu.0'] });
    assert.equal(f.doc.querySelector('tfoot [data-alx-metric] span').textContent, '$25.00');
  } finally { f.close(); }
});
test('native colors preserve text, omit Total and restore exact inline style', () => {
  const f = fixture(); try {
    const cell = f.doc.querySelector('tbody tr').cells[3]; cell.style.color = 'red';
    const r = f.A.adapter.renderer(f.doc);
    r.render(f.A.adapter.discover(f.doc), { ...f.A.defaults(), autoSelect: false, selected: [], rules: [{ target: 'spend', min: 0, max: null, color: '#000000' }] });
    assert.equal(cell.style.color, 'rgb(255, 255, 255)'); assert.equal(f.doc.querySelector('tfoot tr').cells[3].style.color, '');
    r.reset(); assert.equal(cell.style.color, 'red'); assert.equal(cell.style.backgroundColor, '');
  } finally { f.close(); }
});
test('content refresh handles recycled rows, missing columns, realtime, and switch off', async () => {
  const f = fixture({ content: true }); try {
    await wait(); assert.equal(f.doc.querySelectorAll('[data-alx-owned="toolbar"]').length, 1);
    assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.1"] span').textContent, '$10.00');
    f.doc.querySelector('tbody tr').cells[7].textContent = '$400.00';
    await wait(); assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.1"] span').textContent, '$20.00');
    const before = f.doc.querySelectorAll('[data-alx-owned="cell"]').length;
    await wait(400); assert.equal(f.doc.querySelectorAll('[data-alx-owned="cell"]').length, before);
    removeColumn(f.doc, headers.indexOf('D1 unique purchasers')); await wait();
    assert.equal(f.doc.querySelector('[data-alx-metric="arppu.1"]'), null);
    const labels = f.doc.querySelectorAll('label.arco-radio');
    labels[0].classList.remove('arco-radio-checked'); labels[0].querySelector('input').checked = false;
    labels[1].classList.add('arco-radio-checked'); labels[1].querySelector('input').checked = true;
    labels[1].querySelector('input').dispatchEvent(new f.w.Event('change', { bubbles: true })); await wait();
    assert.equal(f.doc.querySelector('[data-alx-metric]'), null);
  } finally { f.close(); }
});
test('panel cancel does not persist; apply saves and hides selected columns', async () => {
  const f = fixture({ content: true }); try {
    await wait(); f.doc.querySelector('.alx-toolbar-button').click();
    const panel = f.doc.querySelector('dialog'); panel.querySelector('.alx-option input').click();
    [...panel.querySelectorAll('button')].find(b => b.textContent === '取消').click();
    assert.equal(Object.keys(f.saved).length, 0);
    f.doc.querySelector('.alx-toolbar-button').click();
    const current = f.doc.querySelector('dialog'); current.querySelector('.alx-controls input').click();
    [...current.querySelectorAll('button')].find(b => b.textContent === '应用').click(); await wait();
    assert.equal(f.saved[f.A.scopeKey(f.w.location.href)].enabled, false);
    assert.equal(f.doc.querySelector('[data-alx-metric]'), null);
    assert.match(f.doc.querySelector('.alx-toolbar-button').textContent, /已关闭/);
  } finally { f.close(); }
});
test('missing dependencies restore without losing selection; reordered rows stay aligned', async () => {
  const second = values.slice(); second[7] = '$600';
  const f = fixture({ rows: [values, second], content: true }); try {
    await wait();
    const body = f.doc.querySelector('tbody'); body.prepend(body.lastElementChild); await wait();
    assert.equal(body.querySelector('[data-alx-metric="arppu.1"] span').textContent, '$30.00');
    const index = headers.indexOf('D1 unique purchasers');
    const removed = [...f.doc.querySelectorAll('tr, colgroup')].map(parent => [parent, parent.children[index]]);
    removed.forEach(([, el]) => el.remove()); await wait();
    assert.equal(f.doc.querySelector('[data-alx-metric="arppu.1"]'), null);
    removed.forEach(([parent, el]) => parent.insertBefore(el, parent.children[index])); await wait();
    assert.equal(body.querySelector('[data-alx-metric="arppu.1"] span').textContent, '$30.00');
  } finally { f.close(); }
});
test('Run suspends stale cells until native data changes', async () => {
  const f = fixture({ content: true }); try {
    await wait(); f.doc.querySelector('button').click(); await wait();
    assert.equal(f.doc.querySelector('[data-alx-metric]'), null);
    assert.match(f.doc.querySelector('.alx-toolbar-button').title, /等待/);
    f.doc.querySelector('tbody tr').cells[7].textContent = '$300'; await wait();
    assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.1"] span').textContent, '$15.00');
  } finally { f.close(); }
});
test('account/report navigation restores only scoped preferences', async () => {
  const f = fixture({ content: true }); try {
    await wait();
    const secondUrl = 'https://ads.applovin.com/analytics/reports?accountId=other&reportId=one';
    f.saved[f.A.scopeKey(secondUrl)] = { ...f.A.defaults(), autoSelect: false, selected: ['arppu.0'] };
    f.w.history.replaceState(null, '', secondUrl); await wait(700);
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, 1);
    assert.equal(f.doc.querySelector('th[data-alx-metric]').dataset.alxMetric, 'arppu.0');
    f.w.history.replaceState(null, '', '/analytics/reports?accountId=demo&reportId=one'); await wait(700);
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, f.A.visibleMetrics(f.A.defaults(), f.A.adapter.discover(f.doc).available).length);
  } finally { f.close(); }
});
test('blank native total dimensions and dimension-only colspan preserve mapping', () => {
  const f = fixture(); try {
    const total = f.doc.querySelector('tfoot tr'); total.cells[0].textContent = ''; total.cells[1].remove(); total.cells[0].colSpan = 2;
    const snap = f.A.adapter.discover(f.doc); assert.equal(snap.ok, true);
    assert.equal(f.A.calculate(f.A.byId.get('arppu.0'), snap.rows.at(-1).values).value, 10);
    const renderer = f.A.adapter.renderer(f.doc);
    renderer.render(snap, { ...f.A.defaults(), autoSelect: false, selected: ['arppu.0'], rules: [{ target: 'arppu.0', min: null, max: null, color: '#ff0000' }] });
    assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.0"]').style.backgroundColor, '');
    assert.match(f.doc.querySelector('tbody [data-alx-metric="arppu.0"]').title, /成熟度待确认/);
  } finally { f.close(); }
});
test('default fills apply to native and derived values without asserting maturity', () => {
  const f = fixture(); try {
    const render = f.A.adapter.renderer(f.doc), snap = f.A.adapter.discover(f.doc);
    render.render(snap, f.A.defaults());
    assert.notEqual(f.doc.querySelector('tbody tr').cells[3].style.backgroundColor, '');
    assert.notEqual(f.doc.querySelector('tbody [data-alx-metric="arppu.1"]').style.backgroundColor, '');
    assert.match(f.doc.querySelector('tbody [data-alx-metric="arppu.1"]').title, /成熟度待确认/);
    assert.equal(f.doc.querySelector('tfoot [data-alx-metric="arppu.1"]').style.backgroundColor, '');
    render.render(snap, { ...f.A.defaults(), defaultColors: false });
    assert.equal(f.doc.querySelector('tbody tr').cells[3].style.backgroundColor, '');
    assert.equal(f.doc.querySelector('tbody [data-alx-metric="arppu.1"]').style.backgroundColor, '');
  } finally { f.close(); }
});
test('resize drag aligns both tables, clamps, cancels, and restores styles', () => {
  const f = fixture(); try {
    const commits = [], snap = f.A.adapter.discover(f.doc), original = snap.tables.map(t => t.getAttribute('style'));
    const render = f.A.adapter.renderer(f.doc, (id, width) => commits.push([id, width]));
    render.render(snap, { ...f.A.defaults(), autoSelect: false, selected: ['arppu.0'] });
    const handle = f.doc.querySelector('.alx-resize');
    const pointer = (target, type, x) => target.dispatchEvent(new f.w.MouseEvent(type, { bubbles: true, clientX: x, button: 0 }));
    pointer(handle, 'pointerdown', 100); pointer(f.doc, 'pointermove', 200); pointer(f.doc, 'pointerup', 200);
    for (const table of snap.tables) { assert.equal(table.querySelector('col[data-alx-metric]').style.width, '216px'); assert.equal(table.style.width, '1616px'); }
    assert.deepEqual(commits, [['arppu.0', 216]]);
    pointer(handle, 'pointerdown', 100); pointer(f.doc, 'pointermove', 1000); pointer(f.doc, 'pointercancel', 1000);
    assert.equal(handle.getAttribute('aria-valuenow'), '216'); assert.equal(commits.length, 1);
    pointer(handle, 'pointerdown', 100); pointer(f.doc, 'pointerup', 1000);
    assert.equal(handle.getAttribute('aria-valuenow'), '480');
    handle.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(handle.getAttribute('aria-valuenow'), '116');
    render.reset(); assert.deepEqual(snap.tables.map(t => t.getAttribute('style')), original);
  } finally { f.close(); }
});
test('column width persists and survives data refresh', async () => {
  const f = fixture({ content: true }); try {
    await wait();
    f.doc.querySelector('th[data-alx-metric="arppu.1"] .alx-resize').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await wait(); assert.equal(f.saved[f.A.scopeKey(f.w.location.href)].widths['arppu.1'], 124);
    f.doc.querySelector('tbody tr').cells[7].textContent = '$400'; await wait();
    for (const col of f.doc.querySelectorAll('col[data-alx-metric="arppu.1"]')) assert.equal(col.style.width, '124px');
  } finally { f.close(); }
});
test('native collapse removes only enhancement nodes; observer must restore them', async () => {
  const f = fixture({ content: true }); try {
    await wait();
    const expected = f.doc.querySelectorAll('th[data-alx-metric]').length;
    f.doc.querySelectorAll('[data-alx-owned="cell"]').forEach(el => el.remove());
    await wait();
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, expected);
  } finally { f.close(); }
});
test('Run with identical response and fast loading cycle recovers after layout collapse', async () => {
  const f = fixture({ content: true }); try {
    await wait(); const expected = f.doc.querySelectorAll('th[data-alx-metric]').length;
    f.doc.querySelector('button').click(); await wait();
    const area = f.doc.querySelector('[data-testid="report-table-area"]');
    area.setAttribute('aria-busy', 'true'); area.setAttribute('aria-busy', 'false');
    area.style.height = '500px'; await wait();
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, expected);
    const group = f.doc.querySelector('.arco-table-header colgroup');
    group.querySelectorAll('[data-alx-owned]').forEach(el => el.remove()); await wait();
    assert.equal(group.querySelectorAll('[data-alx-owned]').length, expected);
  } finally { f.close(); }
});
test('drag reorders headers, body, total and widths; persists across rerender', async () => {
  const f = fixture({ content: true }); try {
    await wait();
    const cells = [...f.doc.querySelectorAll('th[data-alx-metric]')];
    const source = cells[0].dataset.alxMetric, target = cells[2].dataset.alxMetric;
    cells[0].dispatchEvent(new f.w.Event('dragstart', { bubbles: true }));
    cells[2].dispatchEvent(new f.w.Event('drop', { bubbles: true, cancelable: true })); await wait();
    assert.ok(f.saved[f.A.scopeKey(f.w.location.href)].tableOrders.category.indexOf(source) > f.saved[f.A.scopeKey(f.w.location.href)].tableOrders.category.indexOf(target));
    const ids = parent => [...parent.querySelectorAll('[data-alx-metric]')].map(el => el.dataset.alxMetric);
    const order = ids(f.doc.querySelector('thead'));
    for (const parent of f.doc.querySelectorAll('tbody tr, tfoot tr, colgroup')) assert.deepEqual(ids(parent), order);
    f.doc.querySelector('tbody tr').cells[7].textContent = '$345'; await wait();
    assert.deepEqual(ids(f.doc.querySelector('thead')), order);
  } finally { f.close(); }
});
for (const api of ['chrome', 'browser']) test(`${api} storage: mode button switches, remembers order and restores after layout rebuild`, async () => {
  const f = fixture({ content: true, api }); try {
    await wait();
    const ids = () => visualHeaders(f.doc).filter(c => c.dataset.alxMetric).map(c => c.dataset.alxMetric);
    const category = ids();
    const button = f.doc.querySelector('.alx-display-mode');
    assert.match(button.textContent, /按指标/);
    assert.equal(button.previousElementSibling.dataset.alxOwned, 'toolbar');
    button.click(); await wait();
    assert.match(button.textContent, /按周期/); assert.notDeepEqual(ids(), category);
    const cells = [...f.doc.querySelectorAll('th[data-alx-metric]')];
    cells[0].dispatchEvent(new f.w.Event('dragstart', { bubbles: true }));
    cells[2].dispatchEvent(new f.w.Event('drop', { bubbles: true, cancelable: true })); await wait();
    const customPeriod = ids();
    button.click(); await wait(); assert.deepEqual(ids(), category);
    button.click(); await wait(); assert.deepEqual(ids(), customPeriod);
    const saved = f.saved[f.A.scopeKey(f.w.location.href)]; assert.equal(saved.displayMode, 'period');
    assert.ok(saved.tableOrders.period.length);
    button.remove(); await wait(700);
    assert.equal(f.doc.querySelectorAll('.alx-display-mode').length, 1);
    f.A.stop(); assert.equal(f.doc.querySelector('.alx-display-mode'), null);
  } finally { f.close(); }
});

function visualHeaders(doc) {
  const cells = [...doc.querySelectorAll('thead th')];
  const widths = [...doc.querySelectorAll('.arco-table-header col')].map(c => parseFloat(c.style.width));
  let offset = 0;
  return cells.map((cell, i) => { const x = offset + (Number(cell.style.transform.match(/translateX\(([-\d.]+)px\)/)?.[1]) || 0); offset += widths[i]; return { cell, x }; }).sort((a, b) => a.x - b.x).map(v => v.cell);
}
test('Date stays pinned and native-to-enhanced drag preserves original field mapping', async () => {
  const names = [...headers]; names[0] = 'Date';
  const f = fixture({ content: true, names }); try {
    await wait();
    const nativeRow = f.doc.querySelector('thead tr');
    const date = nativeRow.cells[0], spend = nativeRow.cells[3];
    const originalHeaders = [...nativeRow.cells].filter(c => !c.dataset.alxOwned).map(c => c.textContent);
    assert.equal(date.style.position, 'sticky'); assert.equal(date.style.left, '0px'); assert.equal(date.draggable, false);
    const target = f.doc.querySelector('th[data-alx-metric="arppu.1"]');
    spend.dispatchEvent(new f.w.Event('dragstart', { bubbles: true }));
    target.dispatchEvent(new f.w.Event('drop', { bubbles: true, cancelable: true })); await wait();
    const visual = visualHeaders(f.doc);
    assert.equal(visual[0], date); assert.ok(visual.indexOf(spend) > visual.findIndex(c => c.dataset.alxMetric === 'arppu.1'));
    assert.deepEqual([...nativeRow.cells].filter(c => !c.dataset.alxOwned).map(c => c.textContent), originalHeaders);
    assert.equal(f.A.adapter.discover(f.doc).rows[0].values.spend.value, 1000);
    assert.equal(spend.style.transform, f.doc.querySelector('tbody tr').cells[3].style.transform);
    assert.equal(spend.style.transform, f.doc.querySelector('tfoot tr').cells[3].style.transform);
    assert.equal(f.doc.querySelector('tbody tr').cells[0].style.position, 'sticky');
    f.A.stop(); assert.equal(date.style.position, ''); assert.equal(spend.style.transform, ''); assert.equal(spend.hasAttribute('draggable'), false);
  } finally { f.close(); }
});
test('pointer drag reorders native columns without a native sort click', async () => {
  const f = fixture({ content: true }); try {
    await wait(); const cells = f.doc.querySelector('thead tr').cells;
    const source = cells[3], target = cells[5]; f.doc.elementFromPoint = () => target;
    const dispatch = (el, type, x) => el.dispatchEvent(new f.w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x }));
    dispatch(source, 'pointerdown', 100); dispatch(f.doc, 'pointermove', 250); dispatch(f.doc, 'pointerup', 250);
    let sorted = false; source.addEventListener('click', () => { sorted = true; }); dispatch(source, 'click', 250);
    assert.equal(sorted, false); await wait();
    const visual = visualHeaders(f.doc); assert.ok(visual.indexOf(source) > visual.indexOf(target));
    assert.ok(f.saved[f.A.scopeKey(f.w.location.href)].tableOrders.category.includes('native:spend:0'));
  } finally { f.close(); }
});
test('first layout URL update does not invalidate unchanged report data', async () => {
  const f = fixture({ content: true }); try {
    await wait();
    const count = f.doc.querySelectorAll('th[data-alx-metric]').length;
    f.w.history.replaceState(null, '', '?accountId=demo&reportId=one&reportState=synthetic-layout-state');
    f.doc.querySelector('[data-testid="report-table-area"]').style.height = '600px';
    await wait(750);
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, count);
    assert.doesNotMatch(f.doc.querySelector('[data-alx-owned="toolbar"]').title, /等待/);
    f.w.history.replaceState(null, '', '?accountId=demo&reportId=one&reportState=synthetic-expanded-state');
    await wait(750);
    assert.equal(f.doc.querySelectorAll('th[data-alx-metric]').length, count);
  } finally { f.close(); }
});
test('URL layout update during Run must not release pending request', async () => {
  const f = fixture({ content: true }); try {
    await wait(); f.doc.querySelector('button').click();
    f.w.history.replaceState(null, '', '?accountId=demo&reportId=one&reportState=synthetic-layout-state');
    await wait(750);
    assert.equal(f.doc.querySelector('th[data-alx-metric]'), null);
    f.doc.querySelector('tbody tr').cells[7].textContent = '$300'; await wait();
    assert.ok(f.doc.querySelector('th[data-alx-metric]'));
  } finally { f.close(); }
});
