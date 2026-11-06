(() => {
  'use strict';
  // MAIN-world adapter: only the selected grid's in-memory model is inspected.
  // No requests, credentials, application stores, or report mutations are used.
  const A = globalThis.ALX, prefix = '__alx_', doc = document;
  let settings = { ...A.defaults(), enabled: false }, current = null, lastStatus = '', sequence = 0;
  let applying = false, stopped = false, drag = null;
  const send = (type, detail) => doc.dispatchEvent(new CustomEvent(`alx:mui:${type}`, { detail: JSON.stringify(detail) }));
  function locate(root) {
    let fiber = root[Object.keys(root).find(key => key.startsWith('__reactFiber$'))];
    if (!fiber) return null;
    let top = fiber;
    while (top.return) top = top.return;
    if (top.stateNode?.current && top.stateNode.current !== top) fiber = fiber.alternate;
    for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
      const p = fiber.memoizedProps;
      if (Array.isArray(p?.columns) && Array.isArray(p?.rows) && p.apiRef?.current) return p;
    }
    return null;
  }
  function restore(state) {
    if (!state) return;
    for (const [el, old] of state.painted) {
      if (el.style.backgroundColor === old.writtenBackground) el.style.backgroundColor = old.background;
      if (el.style.color === old.writtenColor) el.style.color = old.color;
      if (el.title === old.writtenTitle) old.title === null ? el.removeAttribute('title') : el.setAttribute('title', old.title);
    }
    state.painted.clear();
  }
  function hide(state) {
    if (!state) return;
    restore(state);
    if (!state.root.isConnected) { state.active = false; return; }
    const api = state.api;
    const model = { ...api.state.columns.columnVisibilityModel };
    for (const col of api.getAllColumns()) if (col.field.startsWith(prefix)) model[col.field] = false;
    api.setColumnVisibilityModel(model);
    if (state.active) state.originalOrder.forEach((field, index) => { if (api.getColumn(field)) api.setColumnIndex(field, index); });
    if (state.pinApplied && JSON.stringify(api.getPinnedColumns()) === JSON.stringify(state.pinApplied)) api.setPinnedColumns(state.originalPins);
    state.pinApplied = null;
    for (const el of state.root.querySelectorAll('[data-alx-mui-handle]')) el.remove();
    state.active = false;
  }
  function valuesFor(row, columns) {
    const values = {};
    if (!row || typeof row !== 'object') return values;
    for (const col of columns) {
      const id = A.fieldId(col.headerName);
      if (!id) continue;
      const field = A.fields.get(id), value = row[col.field];
      let text = value === null || value === undefined ? '' : String(value);
      // Verified against native rendering: MUI percentage models contain 25, not .25.
      if (field.unit === 'percent' && /^-?\d+(?:\.\d+)?$/.test(text)) text += '%';
      values[id] = A.parseValue(text, field);
    }
    return values;
  }
  function columnIds(columns) {
    return columns.map((c, i) => `native:${A.normalize(c.headerName || c.field)}:${columns.slice(0, i).filter(x => x.headerName === c.headerName).length}`);
  }
  function orderColumns(columns, metrics) {
    const native = columnIds(columns), all = [...native, ...metrics.map(m => m.id)];
    const saved = settings.tableOrders?.[settings.displayMode] || [];
    const order = [...new Set([...saved.filter(id => all.includes(id)), ...all])];
    const firstMetric = columns.findIndex(c => A.fieldId(c.headerName));
    const primary = native.slice(0, firstMetric < 0 ? native.length : firstMetric);
    for (let i = primary.length - 1; i >= 0; i--) {
      const id = primary[i]; if (saved.includes(id)) continue;
      order.splice(order.indexOf(id), 1);
      const next = primary.slice(i + 1).find(x => order.includes(x));
      const previous = primary.slice(0, i).reverse().find(x => saved.includes(x));
      order.splice(next ? order.indexOf(next) : previous ? order.indexOf(previous) + 1 : 0, 0, id);
    }
    const date = columns.findIndex(c => ['date', 'week', 'month'].includes(A.normalize(c.headerName)));
    if (date >= 0) { order.splice(order.indexOf(native[date]), 1); order.unshift(native[date]); }
    return { native, order, date };
  }
  function apply(state) {
    const { api, columns, available } = state;
    const metrics = A.visibleMetrics(settings, available), layout = orderColumns(columns, metrics);
    state.metrics = metrics; state.layout = layout;
    state.fieldToId = new Map(columns.map((c, i) => [c.field, layout.native[i]]));
    for (const m of metrics) state.fieldToId.set(prefix + m.id, m.id);
    const definitions = metrics.map(m => ({ field: prefix + m.id, headerName: A.label(m, settings.alias),
      description: '增强指标；不参与官方导出。周期成熟度待确认。', width: A.clampWidth(settings.widths[m.id] ?? A.defaultWidth(m)),
      minWidth: 96, maxWidth: 480, sortable: false, filterable: false, disableColumnMenu: true, disableExport: true,
      resizable: false, align: 'center', headerAlign: 'center',
      valueGetter: (_value, row) => { const result = A.calculate(m, valuesFor(row, state.columns)); return `${result.estimate ? '≈ ' : ''}${A.format(m, result)}`; },
      cellClassName: 'alx-mui-cell', headerClassName: 'alx-mui-header'
    }));
    if (definitions.length) api.updateColumns(definitions);
    const visibility = { ...api.state.columns.columnVisibilityModel };
    const selected = new Set(definitions.map(c => c.field));
    for (const col of api.getAllColumns()) if (col.field.startsWith(prefix)) visibility[col.field] = selected.has(col.field);
    api.setColumnVisibilityModel(visibility);
    const fieldById = new Map([...state.fieldToId].map(([field, id]) => [id, field]));
    layout.order.forEach((id, index) => { if (api.getColumnIndex(fieldById.get(id), false) !== index) api.setColumnIndex(fieldById.get(id), index); });
    if (layout.date >= 0) {
      const field = columns[layout.date].field;
      const pins = { left: [field, ...(state.originalPins.left || []).filter(x => x !== field)], right: (state.originalPins.right || []).filter(x => x !== field) };
      state.pinApplied = pins; api.setPinnedColumns(pins);
    }
    state.active = true;
  }
  function paint(state) {
    restore(state);
    const { api, root } = state;
    for (const el of root.querySelectorAll('[role="gridcell"][data-field]')) {
      const rowEl = el.closest('[role="row"][data-id]'), row = rowEl && api.getRow(rowEl.dataset.id);
      if (!row) continue;
      const total = rowEl.dataset.id === '__summary' || row.__isAdsTableV2SummaryRow;
      const field = el.dataset.field, metric = field.startsWith(prefix) && A.byId.get(field.slice(prefix.length));
      const col = state.columns.find(c => c.field === field), id = metric?.id || (col && A.fieldId(col.headerName));
      if (!id) continue;
      const values = valuesFor(row, state.columns), result = metric ? A.calculate(metric, values) : values[id];
      const unit = metric?.unit || A.fields.get(id)?.unit;
      const color = !total && result?.value !== null && result?.value !== undefined ? A.cellColor(id, result.value * (unit === 'percent' ? 100 : 1), settings, !metric && A.fields.get(id)?.day === null) : null;
      const old = { background: el.style.backgroundColor, color: el.style.color, title: el.getAttribute('title') };
      if (color) { el.style.backgroundColor = color; el.style.color = A.textColor(color); }
      if (metric) el.title = [result.reason || result.formula, '来源：当前报表已加载的原生字段', ...(result.warnings || []), result.estimate ? '估算：使用 ROAS 或 CPI' : '', '周期成熟度待确认'].filter(Boolean).join('\n');
      old.writtenBackground = el.style.backgroundColor; old.writtenColor = el.style.color; old.writtenTitle = el.title;
      state.painted.set(el, old);
    }
    for (const header of root.querySelectorAll('[role="columnheader"][data-field]')) {
      const m = A.byId.get(header.dataset.field.slice(prefix.length));
      if (!header.dataset.field.startsWith(prefix) || !m || header.querySelector('[data-alx-mui-handle]')) continue;
      const handle = doc.createElement('span'); handle.className = 'alx-resize'; handle.dataset.alxMuiHandle = m.id;
      handle.dataset.alxOwned = 'resize'; handle.tabIndex = 0; handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-label', `调整 ${A.label(m, settings.alias)} 列宽`); handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-valuemin', '96'); handle.setAttribute('aria-valuemax', '480'); handle.setAttribute('aria-valuenow', String(api.getColumn(header.dataset.field).width));
      handle.addEventListener('click', e => e.stopPropagation());
      handle.addEventListener('dblclick', e => { e.stopPropagation(); send('width', { id: m.id, width: A.defaultWidth(m) }); });
      handle.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        send('width', { id: m.id, width: e.key === 'Home' ? A.defaultWidth(m) : A.clampWidth(api.getColumn(prefix + m.id).width + (e.key === 'ArrowRight' ? 8 : -8)) });
      });
      header.append(handle);
    }
  }
  function tick() {
    if (stopped || applying) return;
    applying = true;
    try {
      const root = doc.querySelector('[data-testid="report-table-area"] .MuiDataGrid-root');
      const props = root && locate(root), api = props?.apiRef.current;
      if (!props || !['getAllColumns', 'getVisibleColumns', 'getColumn', 'getColumnIndex', 'getRow', 'getPinnedColumns', 'setPinnedColumns', 'updateColumns', 'setColumnVisibilityModel', 'setColumnIndex'].every(k => typeof api[k] === 'function')) {
        if (current) { hide(current); current = null; }
        publish({ ok: false, reason: root ? '新版网格接口无法确认，已暂停增强' : '尚未找到新版网格' }); return;
      }
      const columns = props.columns.filter(c => !c.field.startsWith(prefix) && api.state.columns.columnVisibilityModel[c.field] !== false);
      const fields = columns.map(c => A.fieldId(c.headerName)).filter(Boolean), available = new Set(fields);
      if (available.size !== fields.length) { hide(current); publish({ ok: false, reason: '存在重复指标表头，已暂停增强' }); return; }
      const columnSignature = JSON.stringify(columns.map(c => [c.field, c.headerName]));
      const changed = !current || current.root !== root || current.api !== api || current.rowsRef !== props.rows || current.colsRef !== props.columns || current.pinnedRef !== props.pinnedRows || current.columnSignature !== columnSignature;
      if (changed) {
        if (current) hide(current);
        current = { root, api, columns, available, rowsRef: props.rows, colsRef: props.columns, pinnedRef: props.pinnedRows,
          columnSignature, originalOrder: columns.map(c => c.field), originalPins: api.getPinnedColumns(), painted: new Map(), active: false, revision: ++sequence };
      }
      const area = root.closest('[data-testid="report-table-area"]');
      const cohort = [...area.querySelectorAll('input[type="radio"]:checked')].some(el => A.normalize(el.closest('label')?.textContent) === 'cohort') || [...area.querySelectorAll('[role="combobox"]')].some(el => A.normalize(el.textContent) === 'cohort');
      if (props.loading || !settings.enabled || !cohort) { if (current.active) hide(current); }
      else {
        const expected = A.visibleMetrics(settings, available);
        const visible = new Set(api.getVisibleColumns().map(c => c.field));
        if (!current.active || expected.some(m => !visible.has(prefix + m.id))) apply(current);
        paint(current);
      }
      publish({ ok: !props.loading, reason: props.loading ? '报表正在加载' : '', fields: [...available], revision: current.revision, active: current.active, headers: columns.map(c => c.headerName) });
    } catch (error) {
      if (current) {
        restore(current);
        const model = { ...current.api.state.columns.columnVisibilityModel };
        for (const col of current.api.getAllColumns()) if (col.field.startsWith(prefix)) model[col.field] = false;
        current.api.setColumnVisibilityModel(model); current.active = false;
      }
      publish({ ok: false, reason: `新版网格适配失败：${error instanceof Error ? error.name : 'UnknownError'}` });
    } finally { applying = false; exportControl(); }
  }
  function exportCsv() {
    tick();
    if (!current?.active) return;
    const props = locate(current.root);
    if (!props || props.loading || props.rows !== current.rowsRef) return;
    const columns = current.api.getVisibleColumns();
    const byId = new Map(props.rows.map(row => [current.api.getRowId?.(row) ?? row.__rowId, row]));
    const sortedIds = current.api.getSortedRowIds?.();
    const detail = sortedIds ? sortedIds.filter(id => byId.has(id)).map(id => byId.get(id)) : props.rows;
    const rows = [...detail, ...(props.pinnedRows?.bottom || [])];
    const lines = [columns.map(c => c.headerName || c.field), ...rows.map(row => columns.map(col => {
      const metric = col.field.startsWith(prefix) && A.byId.get(col.field.slice(prefix.length));
      if (metric) {
        const result = A.calculate(metric, valuesFor(row, current.columns));
        return `${result.estimate ? '≈ ' : ''}${A.format(metric, result)}`;
      }
      if (row.__isAdsTableV2SummaryRow && col === columns[0] && !A.fieldId(col.headerName)) return 'Total';
      const value = row[col.field];
      const field = A.fields.get(A.fieldId(col.headerName));
      return value == null ? '' : field?.unit === 'percent' && /^-?\d+(?:\.\d+)?$/.test(String(value)) ? `${value}%` : String(value);
    }))];
    const url = URL.createObjectURL(new Blob([A.csv(lines)], { type: 'text/csv;charset=utf-8' }));
    const link = doc.createElement('a'); link.href = url; link.download = 'applovin-enhanced.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let exportButton;
  function exportControl() {
    if (!current?.active) { exportButton?.remove(); exportButton = null; return; }
    const anchor = doc.querySelector('[data-alx-owned="display-mode"]');
    if (!anchor) return;
    if (!exportButton?.isConnected) {
      exportButton = doc.createElement('button'); exportButton.type = 'button';
      exportButton.className = 'alx-toolbar-button'; exportButton.dataset.alxOwned = 'export';
      exportButton.textContent = '导出增强 CSV';
      exportButton.title = '导出当前已加载报表行及 Total，包含当前显示的增强列；不请求其他分页，CSV 不保留颜色';
      exportButton.addEventListener('click', exportCsv);
      anchor.after(exportButton);
    }
  }
  function publish(detail) { const text = JSON.stringify(detail); if (text !== lastStatus) { lastStatus = text; send('status', detail); } }
  function config(event) {
    try { settings = A.normalizeSettings(JSON.parse(event.detail)); } catch { return; }
    if (current) hide(current);
    lastStatus = ''; tick();
  }
  function pointerDown(event) {
    if (!current?.active || event.button !== 0) return;
    const header = event.target.closest('[role="columnheader"][data-field]');
    if (!header || !current.root.contains(header)) return;
    const handle = event.target.closest('[data-alx-mui-handle]');
    if (!handle && event.target.closest('button, input, .MuiDataGrid-columnSeparator')) return;
    drag = { state: current, field: header.dataset.field, id: handle?.dataset.alxMuiHandle, pointer: event.pointerId, x: event.clientX, width: current.api.getColumn(header.dataset.field).width, moved: false };
    if (handle) { event.preventDefault(); event.stopPropagation(); }
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (Math.abs(event.clientX - drag.x) > 5) drag.moved = true;
    if (drag.id) { event.preventDefault(); drag.state.api.updateColumns([{ field: drag.field, width: A.clampWidth(drag.width + event.clientX - drag.x) }]); }
  }
  function pointerUp(event) {
    const d = drag; if (!d || event.pointerId !== d.pointer) return;
    drag = null; if (!d.state.root.isConnected) return;
    if (d.id) send('width', { id: d.id, width: A.clampWidth(d.width + event.clientX - d.x) });
    else if (d.moved) {
      const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest('[role="columnheader"][data-field]');
      const sourceId = d.state.fieldToId.get(d.field), targetId = d.state.fieldToId.get(target?.dataset.field);
      const order = [...d.state.layout.order], dateId = d.state.layout.native[d.state.layout.date];
      if (!sourceId || !targetId || sourceId === dateId || targetId === dateId) return;
      order.splice(order.indexOf(sourceId), 1); order.splice(order.indexOf(targetId), 0, sourceId);
      send('order', { order });
    }
    if (d.moved || d.id) { const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); }; doc.addEventListener('click', stop, { once: true, capture: true }); setTimeout(() => doc.removeEventListener('click', stop, true), 0); }
  }
  const cancel = () => { if (drag?.id) drag.state.api.updateColumns([{ field: drag.field, width: drag.width }]); drag = null; };
  function keydown(event) {
    if (!current?.active || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('[data-alx-mui-handle]')) return;
    const header = event.target.closest('[role="columnheader"][data-field]');
    if (!header || !current.root.contains(header)) return;
    const id = current.fieldToId.get(header.dataset.field), order = [...current.layout.order], from = order.indexOf(id);
    const to = from + (event.key === 'ArrowRight' ? 1 : -1), date = current.layout.native[current.layout.date];
    if (from < 0 || to < 0 || to >= order.length || id === date || order[to] === date) return;
    event.preventDefault(); event.stopPropagation(); order.splice(from, 1); order.splice(to, 0, id); send('order', { order });
  }
  const headerClick = event => {
    const header = event.target.closest('[role="columnheader"][data-field]');
    if (current?.active && header && current.root.contains(header) && header.dataset.field.startsWith(prefix)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  doc.addEventListener('alx:mui:config', config);
  const probe = () => { if (lastStatus) send('status', JSON.parse(lastStatus)); };
  doc.addEventListener('alx:mui:probe', probe);
  doc.addEventListener('keydown', keydown, true);
  doc.addEventListener('click', headerClick, true);
  doc.addEventListener('pointerdown', pointerDown, true); doc.addEventListener('pointermove', pointerMove, { passive: false });
  doc.addEventListener('pointerup', pointerUp); doc.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel);
  const timer = setInterval(tick, 300); tick();
  A.stopMui = () => { stopped = true; exportButton?.remove(); clearInterval(timer); cancel(); hide(current); doc.removeEventListener('click', headerClick, true); doc.removeEventListener('keydown', keydown, true); doc.removeEventListener('alx:mui:probe', probe); doc.removeEventListener('alx:mui:config', config); doc.removeEventListener('pointerdown', pointerDown, true); doc.removeEventListener('pointermove', pointerMove); doc.removeEventListener('pointerup', pointerUp); doc.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); };
})();
