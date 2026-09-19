(() => {
  'use strict';
  const A = globalThis.ALX;
  function settingsPanel(doc, settings, getSnapshot, onApply, onClose = () => {}) {
    const draft = A.normalizeSettings(settings);
    let tab = 'metrics', search = '', saving = false;
    const previousFocus = doc.activeElement;
    const make = (tag, text = '', cls = '') => {
      const node = doc.createElement(tag); node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const button = (text, fn, cls = '') => {
      const node = make('button', text, cls); node.type = 'button'; node.addEventListener('click', fn); return node;
    };
    const checkbox = (checked, fn) => {
      const input = make('input'); input.type = 'checkbox'; input.checked = checked;
      input.addEventListener('change', () => fn(input.checked)); return input;
    };
    const dialog = make('dialog', '', 'alx-panel');
    dialog.dataset.alxOwned = 'panel'; dialog.setAttribute('aria-labelledby', 'alx-panel-title');
    const header = make('header', '', 'alx-panel-header');
    const heading = make('div');
    const h2 = make('h2', '增强列'); h2.id = 'alx-panel-title';
    heading.append(h2, make('p', 'AppLovin Cohort Enhancer · 仅在本机保存设置'));
    const close = () => { if (saving) return; dialog.close(); };
    const closeButton = button('×', close, 'alx-close'); closeButton.setAttribute('aria-label', '关闭增强列设置');
    header.append(heading, closeButton);
    const controls = make('div', '', 'alx-controls');
    const enabled = make('label', '', 'alx-inline'); enabled.append(checkbox(draft.enabled, v => { draft.enabled = v; updateSummary(); }), make('span', '启用报表增强'));
    const alias = make('label', '', 'alx-inline'); alias.append(make('span', '每安装收入名称'));
    const aliasSelect = make('select'); aliasSelect.setAttribute('aria-label', '每安装收入名称');
    for (const v of ['RPD', 'ARPU']) { const option = make('option', v); option.value = v; aliasSelect.append(option); }
    aliasSelect.value = draft.alias; aliasSelect.addEventListener('change', () => { draft.alias = aliasSelect.value; render(); });
    alias.append(aliasSelect); controls.append(enabled, alias);
    const automatic = make('label', '', 'alx-inline');
    automatic.append(checkbox(draft.autoSelect, value => {
      if (!value) draft.selected = A.chosenIds(draft);
      draft.autoSelect = value; render();
    }), make('span', '跟随报表自动展示重点指标'));
    controls.append(automatic);
    const tabs = make('nav', '', 'alx-tabs'); tabs.setAttribute('aria-label', '设置分类');
    const tabButtons = new Map();
    for (const [id, text] of [['metrics', '计算指标'], ['growth', '增长系数'], ['colors', '颜色规则']]) {
      const b = button(text, () => { tab = id; render(); }); tabButtons.set(id, b); tabs.append(b);
    }
    const searchInput = make('input', '', 'alx-search'); searchInput.type = 'search';
    searchInput.placeholder = '搜索指标、收入类型或周期，如 D7/D3'; searchInput.setAttribute('aria-label', '搜索增强指标');
    searchInput.addEventListener('input', () => { search = searchInput.value.toLowerCase().trim(); render(); });
    const note = make('p', '', 'alx-note');
    const list = make('div', '', 'alx-list');
    const summary = make('p', '', 'alx-summary'); summary.setAttribute('aria-live', 'polite');
    const error = make('p', '', 'alx-error'); error.setAttribute('role', 'alert');
    const footer = make('footer', '', 'alx-footer');
    const footText = make('p', '官方保存、分享和导出不包含增强列。? 表示成熟度待确认，≈ 表示估算。');
    const actions = make('div', '', 'alx-actions');
    const apply = button('应用', async () => {
      if (saving) return;
      error.textContent = A.validateRules(draft.rules);
      if (error.textContent) return;
      saving = true; apply.disabled = true; apply.textContent = '保存中…';
      try { await onApply(A.normalizeSettings(draft)); saving = false; dialog.close(); }
      catch { error.textContent = '设置未保存，请重试；若扩展刚更新，请刷新页面。'; }
      finally { saving = false; apply.disabled = false; apply.textContent = '应用'; }
    }, 'alx-primary');
    actions.append(button('取消', close), apply); footer.append(footText, actions);
    dialog.append(header, controls, tabs, searchInput, note, list, summary, error, footer);
    function updateSummary() {
      const s = getSnapshot();
      const supported = A.chosenIds(draft).filter(id => s.available && A.capability(A.byId.get(id), s.available).available).length;
      const count = draft.enabled && s.ok && s.mode === 'cohort' ? supported : 0;
      summary.textContent = `已选 ${A.chosenIds(draft).length} 列 · 当前显示 ${count} 列 · ${A.chosenIds(draft).length - supported} 列缺少字段`;
      if (!s.ok) summary.textContent += ` · ${s.reason || '等待报表'}`;
      else if (s.mode !== 'cohort') summary.textContent += ' · 仅支持 Cohort 模式';
    }
    function toggle(id, checked) {
      if (draft.autoSelect) draft.overrides[id] = checked;
      draft.selected = checked ? [...new Set([...draft.selected, id])] : draft.selected.filter(x => x !== id);
      updateSummary();
    }
    function renderMetrics() {
      const snapshot = getSnapshot(), available = snapshot.available || new Set();
      const filtered = A.metrics.filter(m => m.id.startsWith('growth.') === (tab === 'growth'))
        .filter(m => `${A.label(m, draft.alias)} ${m.group}`.toLowerCase().includes(search));
      const groups = new Map();
      for (const m of filtered) groups.set(m.group, [...groups.get(m.group) || [], m]);
      for (const [name, items] of groups) {
        const group = make('section', '', 'alx-group');
        const bar = make('div', '', 'alx-group-bar');
        bar.append(make('h3', draft.alias === 'ARPU' && tab === 'metrics' ? name.replace('RPD', 'ARPU') : name),
          button('选择本组', () => { items.forEach(m => toggle(m.id, true)); render(); }, 'alx-text-button'),
          button('清空本组', () => { items.forEach(m => toggle(m.id, false)); render(); }, 'alx-text-button'));
        group.append(bar);
        for (const m of items) {
          const cap = A.capability(m, available);
          const row = make('label', '', 'alx-option');
          const text = make('span', A.label(m, draft.alias));
          const status = make('small', cap.available ? cap.estimate ? '可计算 · 估算路径' : '可计算' : `需补齐：${cap.missing.map(id => A.fields.get(id).label).join('、')}`,
            cap.available ? 'alx-available' : 'alx-unavailable');
          row.append(checkbox(A.chosenIds(draft).includes(m.id), v => toggle(m.id, v)), text, status);
          row.title = cap.available ? m.paths.find(p => p.deps.every(d => available.has(d))).formula : '已选但缺字段时暂不显示，补齐后自动恢复。';
          group.append(row);
        }
        list.append(group);
      }
      if (!filtered.length) list.append(make('p', '没有匹配的指标，请更换搜索词。', 'alx-empty'));
    }
    function renderRules() {
      const preset = make('label', '', 'alx-inline alx-color-default');
      preset.append(checkbox(draft.defaultColors, v => { draft.defaultColors = v; }), make('span', '默认数值填色（只表示大小，不评价效果）'));
      list.append(preset);
      const targets = [...A.fields.values(), ...A.metrics];
      const filtered = draft.rules.map((r, i) => [r, i]).filter(([r]) => (targets.find(t => t.id === r.target)?.label || '').toLowerCase().includes(search));
      for (const [rule, index] of filtered) {
        const row = make('div', '', 'alx-rule');
        const enabled = checkbox(rule.enabled !== false, v => { rule.enabled = v; }); enabled.setAttribute('aria-label', `启用颜色规则 ${index + 1}`);
        const select = make('select'); select.setAttribute('aria-label', `规则 ${index + 1} 指标`);
        for (const target of targets) { const option = make('option', target.label); option.value = target.id; select.append(option); }
        select.value = rule.target;
        const hint = make('small', '', 'alx-rule-hint');
        const updateHint = () => { hint.textContent = (A.fields.get(rule.target) || A.byId.get(rule.target))?.unit === 'percent' ? '百分数：5 表示 5%' : '区间含下限、不含上限'; };
        select.addEventListener('change', () => { rule.target = select.value; updateHint(); }); updateHint();
        const bound = (key, caption) => {
          const wrap = make('label', '', 'alx-bound'); wrap.append(make('span', caption));
          const input = make('input'); input.type = 'number'; input.step = 'any'; input.placeholder = '不限'; input.value = rule[key] ?? '';
          input.setAttribute('aria-label', `规则 ${index + 1} ${caption}`);
          input.addEventListener('input', () => { rule[key] = input.validity.badInput ? NaN : input.value === '' ? null : Number(input.value); });
          wrap.append(input); return wrap;
        };
        const color = make('input'); color.type = 'color'; color.value = rule.color; color.setAttribute('aria-label', `规则 ${index + 1} 颜色`);
        color.addEventListener('input', () => { rule.color = color.value; });
        row.append(enabled, select, bound('min', '≥ 下限'), bound('max', '< 上限'), color,
          button('移除', () => { draft.rules.splice(index, 1); render(); }, 'alx-text-button'), hint);
        list.append(row);
      }
      if (!draft.rules.length) list.append(make('p', '尚未设置自定义规则。默认填色开关控制预设；添加自定义规则后，该指标按自定义规则处理。', 'alx-empty'));
      list.append(button('＋ 添加颜色规则', () => { draft.rules.push({ target: 'spend', min: null, max: null, color: '#d9ebff', enabled: true }); search = ''; searchInput.value = ''; render(); }, 'alx-add-rule'));
    }
    function render() {
      for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === tab));
      note.textContent = tab === 'growth' ? '相同同期群分母下，RPD 与 ROAS 倍数等价，可分别选择。1.50× 表示增长 50%。'
        : tab === 'colors' ? '默认配色按固定数值档位由浅至深，含周期指标；? 仍表示成熟度未知。自定义评价色仅用于成熟周期。Total 不着色。'
          : '自动模式展示可计算的基础指标和 ROAS 增长系数，避免重复开启 RPD 倍数。手动取消的列会记住，缺字段时暂时隐藏。';
      list.replaceChildren(); if (tab === 'colors') renderRules(); else renderMetrics(); updateSummary();
    }
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); onClose(); }, { once: true });
    doc.body.append(dialog); render(); dialog.showModal(); searchInput.focus();
    return { close: () => { saving = false; dialog.close(); }, refresh: render };
  }
  A.settingsPanel = settingsPanel;
})();
