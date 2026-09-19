(() => {
  'use strict';
  const days = [0, 1, 3, 7, 14, 28];
  const types = ['iap', 'iaa', 'total'];
  const pairs = [[3, 1], [7, 3], [14, 7], [28, 14], [7, 1], [14, 1], [28, 1]];
  const retentionPairs = [[3, 1], [7, 3], [14, 7], [28, 7], [7, 1], [28, 1]];
  const retentionMultiplierPairs = [[1, 3], [3, 7], [7, 14], [14, 28], [1, 7], [1, 28]];
  const fields = new Map();
  const addField = (id, label, unit = 'number', day = null) => fields.set(id, { id, label, unit, day });
  for (const label of ['Installs', 'Spend', 'CPI', 'CPM', 'IR', 'Impressions', 'Clicks', 'CTR', 'ROAS goal']) {
    addField(label.toLowerCase().replaceAll(' ', '_'), label,
      ['IR', 'CTR', 'ROAS goal'].includes(label) ? 'percent' : ['Spend', 'CPI', 'CPM'].includes(label) ? 'money' : 'integer');
  }
  for (const day of [...days, 60, 90, 180]) {
    for (const type of types) {
      const label = type === 'total' ? 'total' : type.toUpperCase();
      addField(`${type}.rev.${day}`, `D${day} ${label} rev`, 'money', day);
      addField(`${type}.roas.${day}`, `D${day} ${label} ROAS`, 'percent', day);
    }
    addField(`payers.${day}`, `D${day} unique purchasers`, 'integer', day);
    addField(`cpp.${day}`, `D${day} CPP`, 'money', day);
    addField(`retention.${day}`, `D${day} retention`, 'percent', day);
  }
  const normalize = text => String(text).replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const names = new Map([...fields.values()].map(field => [normalize(field.label), field.id]));
  function parseValue(text, field) {
    let raw = String(text).replace(/[\u200b-\u200d\ufeff]/g, '').trim();
    if (/^(?:|--?|—|–|N\/?A|null)$/i.test(raw)) return { value: null, status: 'missing', currency: '' };
    const currency = raw.match(/^(US\$|CA\$|AU\$|USD|EUR|GBP|JPY|CNY|[$€£¥])\s*/)?.[1] || '';
    if (currency) raw = raw.slice(currency.length).trim();
    const percent = raw.endsWith('%');
    if (percent) raw = raw.slice(0, -1).trim();
    const numeric = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
    if (!numeric.test(raw) || (field.unit === 'percent') !== percent || (currency && field.unit !== 'money')) {
      return { value: null, status: 'invalid', currency };
    }
    const value = Number(raw.replaceAll(',', '')) / (percent ? 100 : 1);
    if (!Number.isFinite(value) || (field.unit === 'integer' && !Number.isSafeInteger(value))) {
      return { value: null, status: 'invalid', currency };
    }
    return { value, status: 'ok', currency };
  }
  const path = (deps, formula, run, estimate = false) => ({ deps, formula, run, estimate });
  const metrics = [];
  for (const day of days) {
    const p = `payers.${day}`, rev = `iap.rev.${day}`, roas = `iap.roas.${day}`;
    metrics.push({ id: `payer_rate.${day}`, label: `D${day} Unique 付费率`, group: 'Unique 付费率', day, unit: 'percent',
      paths: [path([p, 'installs'], `${fields.get(p).label} ÷ Installs`, v => v[p] / v.installs)], denominator: ['installs'] });
    metrics.push({ id: `arppu.${day}`, label: `D${day} IAP ARPPU`, group: 'IAP ARPPU', day, unit: 'money',
      paths: [path([rev, p], `${fields.get(rev).label} ÷ ${fields.get(p).label}`, v => v[rev] / v[p]),
        path(['spend', roas, p], `Spend × ${fields.get(roas).label} ÷ ${fields.get(p).label}`, v => v.spend * v[roas] / v[p], true)], denominator: [p] });
    for (const type of types) {
      const r = `${type}.rev.${day}`, q = `${type}.roas.${day}`;
      metrics.push({ id: `rpd.${type}.${day}`, label: `D${day} ${type.toUpperCase()} RPD`, group: `${type.toUpperCase()} RPD`, day, unit: 'rpd',
        paths: [path([r, 'installs'], `${fields.get(r).label} ÷ Installs`, v => v[r] / v.installs),
          path(['spend', q, 'installs'], `Spend × ${fields.get(q).label} ÷ Installs`, v => v.spend * v[q] / v.installs, true),
          path(['cpi', q], `CPI × ${fields.get(q).label}`, v => v.cpi * v[q], true)], denominator: ['installs'] });
    }
  }
  for (const family of ['roas', 'rpd']) for (const type of types) for (const [later, earlier] of pairs) {
    const hi = `${type}.rev.${later}`, lo = `${type}.rev.${earlier}`;
    const hq = `${type}.roas.${later}`, lq = `${type}.roas.${earlier}`;
    metrics.push({ id: `growth.${family}.${type}.${later}.${earlier}`,
      label: `${type.toUpperCase()} ${family.toUpperCase()} 倍数 D${later}/D${earlier}`,
      group: `${type.toUpperCase()} ${family.toUpperCase()} 增长系数`, day: later, unit: 'multiple',
      paths: [path([hi, lo], `${fields.get(hi).label} ÷ ${fields.get(lo).label}`, v => v[hi] / v[lo]),
        path([hq, lq], `${fields.get(hq).label} ÷ ${fields.get(lq).label}`, v => v[hq] / v[lq], true)], denominator: [lo, lq] });
  }
  for (const [later, earlier] of retentionPairs) {
    const hi = `retention.${later}`, lo = `retention.${earlier}`;
    metrics.push({ id: `retention_decay.${later}.${earlier}`,
      label: `留存衰退系数 D${later}/D${earlier}`,
      group: '留存衰退系数', day: later, unit: 'multiple',
      paths: [path([hi, lo], `${fields.get(hi).label} ÷ ${fields.get(lo).label}`, v => v[hi] / v[lo])], denominator: [lo] });
  }
  for (const [earlier, later] of retentionMultiplierPairs) {
    const hi = `retention.${earlier}`, lo = `retention.${later}`;
    metrics.push({ id: `retention_multiplier.${earlier}.${later}`,
      label: `留存倍率系数 D${earlier}/D${later}`,
      group: '留存倍率系数', day: later, unit: 'multiple',
      paths: [path([hi, lo], `${fields.get(hi).label} ÷ ${fields.get(lo).label}`, v => v[hi] / v[lo])], denominator: [lo] });
  }
  const byId = new Map(metrics.map(m => [m.id, m]));
  function capability(metric, available) {
    const ready = metric.paths.find(p => p.deps.every(d => available.has(d)));
    if (ready) return { available: true, estimate: ready.estimate, missing: [] };
    const missing = metric.paths.map(p => p.deps.filter(d => !available.has(d))).sort((a, b) => a.length - b.length)[0];
    return { available: false, missing };
  }
  function calculate(metric, row) {
    const fail = reason => ({ value: null, reason, estimate: false, currency: '' });
    const relevant = new Set(metric.paths.flatMap(p => p.deps));
    // Explicit invalid data or a zero denominator must not be hidden by a fallback.
    for (const key of relevant) {
      if (row[key]?.status === 'invalid') return fail(`${fields.get(key).label} 格式或数值异常`);
    }
    for (const key of metric.denominator) {
      if (row[key]?.status === 'ok' && row[key].value === 0) return fail(`${fields.get(key).label} 为零，无法计算`);
    }
    if (metric.id.startsWith('payer_rate.') && row.installs?.status === 'ok' && row[`payers.${metric.day}`]?.value > row.installs.value) {
      return fail('付费人数大于 Installs，请核对口径');
    }
    for (const p of metric.paths) {
      if (!p.deps.every(d => row[d]?.status === 'ok')) continue;
      const currencies = new Set(p.deps.map(d => row[d].currency).filter(Boolean));
      if (currencies.size > 1) return fail('参与计算的币种标识不一致');
      const value = p.run(Object.fromEntries(p.deps.map(d => [d, row[d].value])));
      if (!Number.isFinite(value) || value < 0) return fail('计算结果异常');
      const warnings = [];
      const revenues = ['iap', 'iaa', 'total'].map(t => row[`${t}.rev.${metric.day}`]);
      if (revenues.every(v => v?.status === 'ok') && Math.abs(revenues[0].value + revenues[1].value - revenues[2].value) > 0.021) {
        warnings.push('原生 Total 与 IAP＋IAA 收入不一致，请核对');
      }
      return { value, formula: p.formula, estimate: p.estimate, currency: [...currencies][0] || '', reason: '', warnings };
    }
    return fail('必要字段缺失或该行为空');
  }
  function label(metric, alias = 'RPD') { return alias === 'ARPU' && metric.id.startsWith('rpd.') ? metric.label.replace('RPD', 'ARPU') : metric.label; }
  function format(metric, result) {
    if (result.value === null) return '—';
    const digits = metric.unit === 'rpd' ? 4 : 2;
    const value = metric.unit === 'percent' ? result.value * 100 : result.value;
    return `${['money', 'rpd'].includes(metric.unit) ? result.currency : ''}${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${metric.unit === 'percent' ? '%' : metric.unit === 'multiple' ? '×' : ''}`;
  }
  function defaults() {
    return { version: 1, enabled: true, alias: 'RPD', selected: [1, 7].flatMap(d => [`payer_rate.${d}`, `arppu.${d}`, `rpd.total.${d}`]), autoSelect: true, overrides: {}, displayMode: 'category', orders: {}, tableOrders: {}, order: [], rules: [], defaultColors: true, widths: {} };
  }
  function normalizeSettings(value) {
    if (!value || typeof value !== 'object' || value.version !== 1) return defaults();
    const legacy = [1, 7].flatMap(d => [`payer_rate.${d}`, `arppu.${d}`, `rpd.total.${d}`]);
    const unchanged = !Array.isArray(value.selected) || (value.selected.length === legacy.length && legacy.every(id => value.selected.includes(id)));
    const cleanOrder = list => Array.isArray(list) ? [...new Set(list.filter(id => byId.has(id)))] : [];
    const displayMode = value.displayMode === 'period' ? 'period' : 'category';
    const orders = { category: cleanOrder(value.orders?.category), period: cleanOrder(value.orders?.period ?? (!value.displayMode ? value.order : [])) };
    return { displayMode, orders, tableOrders: Object.fromEntries(['category', 'period'].map(mode => [mode, Array.isArray(value.tableOrders?.[mode]) ? [...new Set(value.tableOrders[mode].filter(id => typeof id === 'string' && (byId.has(id) || id.startsWith('native:'))))] : []])), autoSelect: typeof value.autoSelect === 'boolean' ? value.autoSelect : unchanged,
      overrides: Object.fromEntries(Object.entries(value.overrides || {}).filter(([id, flag]) => byId.has(id) && typeof flag === 'boolean')),
      order: value.displayMode ? cleanOrder(value.order ?? orders[displayMode]) : orders.category,
      version: 1, enabled: value.enabled !== false, alias: value.alias === 'ARPU' ? 'ARPU' : 'RPD',
      defaultColors: value.defaultColors !== false,
      widths: Object.fromEntries(Object.entries(value.widths || {}).filter(([id, width]) => byId.has(id) && Number.isFinite(width)).map(([id, width]) => [id, clampWidth(width)])),
      selected: Array.isArray(value.selected) ? [...new Set(value.selected.filter(id => byId.has(id)))] : defaults().selected,
      rules: Array.isArray(value.rules) ? value.rules.filter(r => r && typeof r === 'object').map(r => ({ ...r })) : [] };
  }
  function chosenIds(settings) {
    if (!settings.autoSelect) return settings.selected;
    return metrics.filter(m => settings.overrides?.[m.id] ?? !m.id.startsWith('growth.rpd.')).map(m => m.id);
  }
  function orderedIds(settings) {
    const groups = [...new Set(metrics.map(m => m.group))];
    const base = [...metrics].sort((a, b) => settings.displayMode === 'period'
      ? a.day - b.day || groups.indexOf(a.group) - groups.indexOf(b.group)
      : groups.indexOf(a.group) - groups.indexOf(b.group) || a.day - b.day);
    const ranked = [...new Set([...(settings.order || []), ...base.map(m => m.id)])].filter(id => byId.has(id));
    return ranked.sort((a, b) => settings.displayMode === 'period'
      ? byId.get(a).day - byId.get(b).day
      : groups.indexOf(byId.get(a).group) - groups.indexOf(byId.get(b).group));
  }
  function visibleMetrics(settings, available) {
    const chosen = new Set(chosenIds(settings));
    const order = orderedIds(settings);
    return order.filter(id => chosen.has(id) && byId.has(id) && capability(byId.get(id), available).available).map(id => byId.get(id));
  }
  function moveMetric(settings, source, target) {
    const order = orderedIds(settings);
    const a = byId.get(source), b = byId.get(target);
    if (!a || !b || (settings.displayMode === 'period' ? a.day !== b.day : a.group !== b.group)) return order;
    const from = order.indexOf(source), to = order.indexOf(target);
    if (from < 0 || to < 0 || from === to) return order;
    order.splice(from, 1); order.splice(to, 0, source); return order;
  }
  function validateRules(rules) {
    const groups = new Map();
    for (const r of rules) {
      if (!fields.has(r.target) && !byId.has(r.target)) return '请选择有效指标';
      if (!/^#[0-9a-f]{6}$/i.test(r.color)) return '请选择有效颜色';
      if ((r.min !== null && !Number.isFinite(r.min)) || (r.max !== null && !Number.isFinite(r.max))) return '区间边界必须为数字，留空表示不限';
      if ((r.min ?? -Infinity) >= (r.max ?? Infinity)) return '区间下限必须小于上限';
      if (r.enabled === false) continue;
      const list = groups.get(r.target) || [];
      if (list.some(other => (r.min ?? -Infinity) < (other.max ?? Infinity) && (other.min ?? -Infinity) < (r.max ?? Infinity))) return '同一指标的启用区间不能重叠';
      groups.set(r.target, [...list, r]);
    }
    return '';
  }
  function colorFor(target, value, rules) {
    if (!Number.isFinite(value) || validateRules(rules)) return null;
    return rules.find(r => r.enabled !== false && r.target === target && value >= (r.min ?? -Infinity) && value < (r.max ?? Infinity))?.color || null;
  }
  const defaultWidth = metric => metric.unit === 'multiple' ? 132 : 116;
  const clampWidth = value => Math.max(96, Math.min(480, Math.round(value)));
  function defaultColor(id, value) {
    if (!Number.isFinite(value) || value <= 0) return null;
    const field = fields.get(id) || byId.get(id);
    if (!field) return null;
    const bands = field.unit === 'percent' ? [5, 10, 20, 50] : id.startsWith('retention_decay.') ? [.25, .5, .75, .9]
      : id.startsWith('retention_multiplier.') ? [1, 1.25, 1.5, 2]
      : field.unit === 'multiple' ? [1, 1.5, 2, 3]
      : field.unit === 'rpd' ? [.1, .5, 1, 3] : id === 'spend' ? [1000, 10000, 30000, 50000]
        : field.unit === 'integer' ? [10, 100, 1000, 10000] : [5, 10, 25, 50];
    const colors = id === 'spend' ? ['#edf8ef', '#d5efd9', '#b1e2ba', '#83d293', '#52bf6a']
      : id === 'cpi' || id === 'cpm' ? ['#fffbea', '#fff4cc', '#ffedaa', '#ffe487', '#ffdb66']
        : id.startsWith('arppu.') ? ['#fdf1f6', '#fbe0ec', '#f7c8de', '#efaccb', '#e78eb8']
          : ['#eff6ff', '#dcecff', '#bedcff', '#94c4f5', '#68a9e6'];
    return colors[bands.filter(bound => value >= bound).length];
  }
  function cellColor(id, value, settings, mature) {
    // An explicit target owns its colors, including disabled rules and gaps.
    if (settings.rules.some(rule => rule.target === id)) return mature ? colorFor(id, value, settings.rules) : null;
    return settings.defaultColors !== false ? defaultColor(id, value) : null;
  }
  function textColor(hex) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 0.179 ? '#000000' : '#ffffff';
  }
  function scopeKey(url) {
    const u = new URL(url);
    const account = u.searchParams.get('accountId');
    if (!account || !/^[a-zA-Z0-9_-]{1,80}$/.test(account)) return null;
    const report = u.searchParams.get('reportId');
    return `alx:v1:${u.hostname}:${account}:${report && /^[a-zA-Z0-9_-]{1,80}$/.test(report) ? report : 'default'}`;
  }
  // The site's rolling-window boundary and ingestion delay are not yet verified.
  // Never infer maturity from a non-zero future column or invent a delay threshold.
  const maturity = () => ({ state: 'unknown', label: '成熟度待确认', reason: '尚未核验 AppLovin 窗口端点与回传延迟，当前值不代表完整周期结果' });
  globalThis.ALX = { days, types, pairs, retentionPairs, retentionMultiplierPairs, fields, metrics, byId, normalize, fieldId: text => names.get(normalize(text)) || null,
    parseValue, capability, calculate, label, format, defaults, normalizeSettings, validateRules, colorFor, textColor, scopeKey, maturity, clampWidth, defaultColor, cellColor, chosenIds, visibleMetrics, moveMetric, orderedIds, defaultWidth };
})();
