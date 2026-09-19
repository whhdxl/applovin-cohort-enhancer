(() => {
  'use strict';
  const A = globalThis.ALX;
  const owned = '[data-alx-owned]';
  const nativeCells = row => [...row.cells].filter(cell => !cell.matches(owned));
  function mode(root) {
    const selected = [...root.querySelectorAll('input[type="radio"]:checked')].map(input => (input.closest('label') || input.parentElement).textContent);
    selected.push(...[...root.querySelectorAll('[role="radio"][aria-checked="true"], .arco-radio-checked')].map(el => el.textContent));
    if (selected.some(text => A.normalize(text) === 'real time')) return 'realtime';
    return selected.some(text => A.normalize(text) === 'cohort') ? 'cohort' : 'unknown';
  }
  function readRow(element, headers, total) {
    const cells = nativeCells(element), values = {}, mapped = new Map();
    let index = 0, valid = true;
    for (const cell of cells) {
      const span = cell.colSpan || 1;
      if (span === 1 && headers[index]?.field) {
        const field = headers[index].field;
        mapped.set(field, cell);
        values[field] = A.parseValue(cell.textContent, A.fields.get(field));
      } else if (headers.slice(index, index + span).some(h => h.field)) valid = false;
      index += span;
    }
    if (index !== headers.length || cells.some(cell => cell.rowSpan > 1)) valid = false;
    return { element, cells: mapped, values, total, valid, signature: cells.map(c => `${c.colSpan}:${c.textContent}`).join('|') };
  }
  function discover(doc) {
    const area = doc.querySelector('[data-testid="report-table-area"]');
    if (!area) return { ok: false, reason: '尚未找到报表区域' };
    const button = [...area.querySelectorAll('button')].find(el => !el.closest(owned) && A.normalize(el.textContent) === 'columns');
    const tableRoot = area.querySelector('.arco-table');
    const base = { area, button, mode: mode(area) };
    if (!tableRoot) return { ...base, ok: false, reason: '未识别当前表格结构' };
    if (area.querySelector('.arco-spin-loading, [aria-busy="true"]')) return { ...base, ok: false, reason: '报表正在加载' };
    const headTables = [...tableRoot.querySelectorAll('.arco-table-header table')];
    const bodyTables = [...tableRoot.querySelectorAll('.arco-table-body table')];
    if (headTables.length !== 1 || bodyTables.length !== 1) return { ...base, ok: false, reason: '表格结构发生变化，已暂停增强' };
    const head = headTables[0], body = bodyTables[0];
    const headRows = [...head.querySelectorAll('thead > tr')];
    if (headRows.length !== 1) return { ...base, ok: false, reason: '暂不支持多层表头' };
    const cells = nativeCells(headRows[0]);
    if (!cells.length || cells.some(c => c.colSpan !== 1 || c.rowSpan !== 1)) return { ...base, ok: false, reason: '表头无法可靠映射' };
    const headers = cells.map(cell => ({ cell, text: cell.textContent.trim(), field: A.fieldId(cell.textContent) }));
    const ids = headers.map(h => h.field).filter(Boolean), available = new Set(ids);
    if (ids.length !== available.size) return { ...base, ok: false, reason: '存在重复指标表头，已暂停增强' };
    for (const table of [head, body]) {
      const cols = [...table.querySelectorAll(':scope > colgroup > col')].filter(c => !c.matches(owned));
      if (cols.length !== cells.length || cols.some(c => !Number.isFinite(parseFloat(c.style.width)))) {
        return { ...base, ok: false, reason: '原生列宽结构无法确认，已暂停增强' };
      }
    }
    const rows = [...body.querySelectorAll(':scope > tbody > tr, :scope > tfoot > tr')]
      .filter(row => !row.querySelector('.arco-empty'))
      .map(row => readRow(row, headers, row.parentElement.tagName === 'TFOOT'));
    if (rows.some(row => !row.valid)) return { ...base, ok: false, reason: '数据行与表头不一致，已暂停增强' };
    const widths = [head, body].map(t => [...t.querySelectorAll(':scope > colgroup > col')].filter(c => !c.matches(owned)).map(c => c.style.width).join(','));
    return { ...base, ok: true, root: tableRoot, tables: [head, body], headRow: headRows[0], headers, available, rows,
      signature: JSON.stringify([headers.map(h => h.text), rows.map(r => [r.total, r.signature]), widths, base.mode]) };
  }
  function renderer(doc, onResize = () => {}, onReorder = () => {}) {
    let cancelDrag = null, draggedId = null;
    const cleanups = [];
    let relayout = () => {};
    const added = new Set(), changes = new Map(), hadStyle = new Map();
    function writeStyle(el, property, value) {
      if (!changes.has(el)) { changes.set(el, new Map()); hadStyle.set(el, el.hasAttribute('style')); }
      const old = changes.get(el).get(property)?.old || { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) };
      el.style.setProperty(property, value);
      changes.get(el).set(property, { old, written: el.style.getPropertyValue(property) });
    }
    function reset() {
      cancelDrag?.(); cancelDrag = null; draggedId = null;
      cleanups.splice(0).forEach(fn => fn()); relayout = () => {};
      for (const el of added) el.remove();
      added.clear();
      for (const [el, properties] of changes) for (const [property, state] of properties) {
        if (el.style.getPropertyValue(property) === state.written) {
          if (state.old.value) el.style.setProperty(property, state.old.value, state.old.priority);
          else el.style.removeProperty(property);
        }
      }
      for (const [el, existed] of hadStyle) if (!existed && !el.style.length) el.removeAttribute('style');
      changes.clear(); hadStyle.clear();
    }
    function append(parent, tag, text = '') {
      const el = doc.createElement(tag);
      el.dataset.alxOwned = 'cell';
      el.textContent = text;
      parent.append(el);
      added.add(el);
      return el;
    }
    function paint(cell, color) {
      if (!color) return;
      writeStyle(cell, 'background-color', color);
      writeStyle(cell, 'color', A.textColor(color));
      for (const child of cell.querySelectorAll('*')) writeStyle(child, 'color', A.textColor(color));
    }
    function render(snapshot, settings) {
      reset();
      if (!snapshot.ok || snapshot.mode !== 'cohort' || !settings.enabled) return [];
      const selected = A.visibleMetrics(settings, snapshot.available);
      const widths = { ...settings.widths };
      const widthOf = id => A.clampWidth(widths[id] ?? A.defaultWidth(A.byId.get(id)));
      if (selected.length) for (const table of snapshot.tables) {
        const group = table.querySelector(':scope > colgroup');
        const nativeWidth = [...group.children].reduce((sum, c) => sum + parseFloat(c.style.width), 0);
        for (const m of selected) { const col = append(group, 'col'); col.style.width = `${widthOf(m.id)}px`; col.dataset.alxMetric = m.id; }
        writeStyle(table, 'width', `${nativeWidth + selected.reduce((sum, m) => sum + widthOf(m.id), 0)}px`);
        writeStyle(table, 'min-width', `${nativeWidth + selected.reduce((sum, m) => sum + widthOf(m.id), 0)}px`);
      }
      for (const m of selected) {
        const cell = append(snapshot.headRow, 'th', A.label(m, settings.alias));
        cell.className = 'arco-table-th alx-header';
        cell.scope = 'col';
        cell.dataset.alxMetric = m.id;
        cell.title = '增强指标；不支持原生排序或导出。悬浮数值可查看计算来源。';
        const handle = doc.createElement('span'); handle.className = 'alx-resize'; handle.tabIndex = 0;
        handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', `调整 ${A.label(m, settings.alias)} 列宽`);
        handle.setAttribute('aria-valuemin', '96'); handle.setAttribute('aria-valuemax', '480');
        handle.setAttribute('aria-valuenow', String(widthOf(m.id)));
        handle.title = '拖动调整宽度；方向键微调；双击恢复默认'; cell.append(handle);
        const setWidth = value => {
          widths[m.id] = A.clampWidth(value); handle.setAttribute('aria-valuenow', String(widths[m.id]));
          for (const table of snapshot.tables) {
            const cols = [...table.querySelectorAll(':scope > colgroup > col')];
            const col = cols.find(c => c.dataset.alxMetric === m.id); if (col) col.style.width = `${widths[m.id]}px`;
            const sum = cols.reduce((n, c) => n + parseFloat(c.style.width), 0);
            writeStyle(table, 'width', `${sum}px`); writeStyle(table, 'min-width', `${sum}px`);
          }
          relayout();
        };
        const commit = () => onResize(m.id, widthOf(m.id));
        handle.addEventListener('click', event => event.stopPropagation());
        handle.addEventListener('dblclick', event => { event.stopPropagation(); setWidth(A.defaultWidth(m)); commit(); });
        handle.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          setWidth(event.key === 'Home' ? A.defaultWidth(m) : widthOf(m.id) + (event.key === 'ArrowRight' ? 8 : -8)); commit();
        });
        handle.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); cancelDrag?.();
          const startX = event.clientX, startWidth = widthOf(m.id), pointer = event.pointerId;
          const move = e => { if (e.pointerId === pointer) setWidth(startWidth + e.clientX - startX); };
          const cleanup = () => {
            doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', finish);
            doc.removeEventListener('pointercancel', cancel); doc.defaultView.removeEventListener('blur', cancel); cancelDrag = null;
          };
          const finish = e => { if (e.pointerId !== pointer) return; move(e); cleanup(); commit(); };
          const cancel = () => { setWidth(startWidth); cleanup(); };
          cancelDrag = cancel;
          doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', finish);
          doc.addEventListener('pointercancel', cancel); doc.defaultView.addEventListener('blur', cancel);
        });
      }
      for (const row of snapshot.rows) {
        const maturity = A.maturity(row);
        for (const m of selected) {
          const result = A.calculate(m, row.values);
          const cell = append(row.element, 'td');
          cell.className = 'arco-table-td alx-cell';
          cell.dataset.alxMetric = m.id;
          const number = doc.createElement('span'); number.textContent = A.format(m, result); cell.append(number);
          const notes = [result.reason || result.formula, '来源：当前页面显示值', ...result.warnings || []];
          if (result.estimate) notes.push('估算：使用已舍入的 ROAS 或 CPI');
          if (result.value !== null) {
            const badge = doc.createElement('small');
            badge.className = 'alx-state';
            badge.textContent = result.estimate ? '≈ ?' : '?';
            badge.setAttribute('aria-label', `${result.estimate ? '估算；' : ''}${maturity.label}`);
            cell.append(badge);
            notes.push(`${maturity.label}：${maturity.reason}`);
          }
          if (m.id.startsWith('rpd.')) notes.push('分母：同一同期群 Installs');
          cell.title = notes.filter(Boolean).join('\n');
          if (!row.total && result.value !== null) {
            paint(cell, A.cellColor(m.id, result.value * (m.unit === 'percent' ? 100 : 1), settings, maturity.state === 'mature'));
          }
        }
        if (!row.total) for (const [id, cell] of row.cells) {
          const field = A.fields.get(id), v = row.values[id];
          if (v.status === 'ok') {
            paint(cell, A.cellColor(id, v.value * (field.unit === 'percent' ? 100 : 1), settings, field.day === null || maturity.state === 'mature'));
          }
        }
      }
      // Reposition visually without changing React-owned node order or column indexes.
      // This preserves native sort/resize handlers and stable field-to-cell mapping.
      const nativeCols = snapshot.headers.map((h, i) => ({ id: `native:${A.normalize(h.text)}:${snapshot.headers.slice(0, i).filter(x => x.text === h.text).length}`, cell: h.cell }));
      const columns = [...nativeCols, ...selected.map(m => ({ id: m.id, cell: snapshot.headRow.querySelector(`[data-alx-metric="${m.id}"]`) }))];
      const date = nativeCols.find(c => A.normalize(c.cell.textContent) === 'date');
      const ids = columns.map(c => c.id);
      const saved = settings.tableOrders?.[settings.displayMode] || [];
      const visual = [...new Set([...saved.filter(id => ids.includes(id)), ...ids])];
      if (date) { visual.splice(visual.indexOf(date.id), 1); visual.unshift(date.id); }
      const regularRows = snapshot.rows.filter(row => [...row.element.cells].every(cell => cell.colSpan === 1));
      const supported = regularRows.length === snapshot.rows.length;
      relayout = () => {
        const sizes = [...snapshot.tables[0].querySelectorAll('col')].map(col => parseFloat(col.style.width));
        const original = new Map(), target = new Map(); let sum = 0;
        ids.forEach((id, i) => { original.set(id, sum); sum += sizes[i]; }); sum = 0;
        visual.forEach(id => { target.set(id, sum); sum += sizes[ids.indexOf(id)]; });
        for (const [index, column] of columns.entries()) {
          const cells = [column.cell, ...regularRows.map(row => row.element.cells[index])];
          for (const cell of cells) {
            if (!cell) continue;
            const pinned = column.id === date?.id;
            writeStyle(cell, 'position', pinned ? 'sticky' : 'relative');
            writeStyle(cell, 'left', pinned ? `${original.get(column.id)}px` : 'auto');
            writeStyle(cell, 'right', 'auto');
            writeStyle(cell, 'transform', `translateX(${(supported ? target.get(column.id) : original.get(column.id)) - original.get(column.id)}px)`);
            writeStyle(cell, 'z-index', pinned ? (cell.tagName === 'TH' ? '5' : '4') : '1');
            if (pinned) {
              writeStyle(cell, 'background-color', cell.tagName === 'TH' || cell.parentElement.parentElement.tagName === 'TFOOT' ? '#eef1f5' : '#ffffff');
              writeStyle(cell, 'box-shadow', '2px 0 0 #d9dee5');
            }
          }
        }
      };
      if (supported) relayout();
      const listen = (el, event, fn) => { el.addEventListener(event, fn); cleanups.push(() => el.removeEventListener(event, fn)); };
      for (const column of columns) {
        if (!supported || column.id === date?.id) continue;
        const cell = column.cell, oldDrag = cell.getAttribute('draggable'), oldTab = cell.getAttribute('tabindex');
        cell.draggable = false; cell.tabIndex = 0; writeStyle(cell, 'cursor', 'grab'); writeStyle(cell, 'user-select', 'none');
        cleanups.push(() => { for (const [key, value] of [['draggable', oldDrag], ['tabindex', oldTab]]) value === null ? cell.removeAttribute(key) : cell.setAttribute(key, value); });
        listen(cell, 'dragstart', event => {
          if (event.target.closest('.alx-resize, .react-resizable-handle, input, button')) { event.preventDefault(); return; }
          draggedId = column.id; event.stopPropagation();
          if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.id); }
        });
        listen(cell, 'dragover', event => { if (draggedId && draggedId !== column.id) { event.preventDefault(); event.stopPropagation(); } });
        const move = (source, targetId) => {
          const order = [...visual], from = order.indexOf(source), to = order.indexOf(targetId);
          if (from < 0 || to < 0 || source === date?.id || targetId === date?.id) return;
          order.splice(from, 1); order.splice(to, 0, source); onReorder(source, targetId, order);
        };
        listen(cell, 'pointerdown', event => {
          if (event.button !== 0 || event.target.closest('.alx-resize, .react-resizable-handle, input, button')) return;
          cancelDrag?.(); const startX = event.clientX, startY = event.clientY, pointer = event.pointerId;
          let moved = false;
          const track = e => {
            if (e.pointerId !== pointer) return;
            if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 5) moved = true;
            if (moved) e.preventDefault();
          };
          const cleanup = () => { doc.removeEventListener('pointermove', track); doc.removeEventListener('pointerup', finish); doc.removeEventListener('pointercancel', cleanup); doc.defaultView.removeEventListener('blur', cleanup); cancelDrag = null; };
          const finish = e => {
            if (e.pointerId !== pointer) return;
            cleanup(); if (!moved) return;
            e.preventDefault();
            const hit = doc.elementFromPoint(e.clientX, e.clientY)?.closest('th');
            const target = columns.find(c => c.cell === hit);
            const suppressClick = click => { click.preventDefault(); click.stopImmediatePropagation(); };
            cell.addEventListener('click', suppressClick, { capture: true, once: true });
            setTimeout(() => cell.removeEventListener('click', suppressClick, true), 0);
            if (target) move(column.id, target.id);
          };
          cancelDrag = cleanup;
          doc.addEventListener('pointermove', track, { passive: false }); doc.addEventListener('pointerup', finish);
          doc.addEventListener('pointercancel', cleanup); doc.defaultView.addEventListener('blur', cleanup);
        });
        listen(cell, 'drop', event => { if (!draggedId) return; event.preventDefault(); event.stopPropagation(); move(draggedId, column.id); draggedId = null; });
        listen(cell, 'dragend', () => { draggedId = null; });
        listen(cell, 'keydown', event => {
          if (event.target !== cell || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); const targetId = visual[visual.indexOf(column.id) + (event.key === 'ArrowRight' ? 1 : -1)];
          if (targetId) move(column.id, targetId);
        });
      }
      return selected;
    }
    return { reset, render };
  }
  A.adapter = { discover, renderer, mode };
})();
