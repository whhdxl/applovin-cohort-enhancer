(() => {
  'use strict';
  const A = globalThis.ALX;
  let status = null, configured = '', onResize = () => {}, onReorder = () => {};
  document.addEventListener('alx:mui:status', event => {
    try { const value = JSON.parse(event.detail); if (typeof value.ok === 'boolean') status = value; } catch { /* Ignore unrelated page events. */ }
  });
  document.addEventListener('alx:mui:width', event => {
    try { const value = JSON.parse(event.detail); if (A.byId.has(value.id) && Number.isFinite(value.width)) onResize(value.id, A.clampWidth(value.width)); } catch { /* Invalid event. */ }
  });
  document.addEventListener('alx:mui:order', event => {
    try { const { order } = JSON.parse(event.detail); if (Array.isArray(order) && order.length < 500 && order.every(id => typeof id === 'string' && (A.byId.has(id) || /^native:.{1,200}:\d+$/.test(id)))) onReorder(null, null, order); } catch { /* Invalid event. */ }
  });
  function configure(settings) {
    const value = JSON.stringify(settings);
    if (value === configured) return;
    configured = value;
    document.dispatchEvent(new CustomEvent('alx:mui:config', { detail: value }));
  }
  A.mui = {
    discover(base, root) {
      document.dispatchEvent(new CustomEvent('alx:mui:probe'));
      const result = status || { ok: false, reason: '等待新版网格适配初始化' };
      return { ...base, ...result, kind: 'mui', root, available: new Set(result.fields || []), rows: [], tables: [],
        headers: (result.headers || []).map(text => ({ text, field: A.fieldId(text) })), signature: `mui:${result.revision}:${base.mode}` };
    },
    bind(resize, reorder) { onResize = resize; onReorder = reorder; },
    render(snapshot, settings) { configure({ ...settings, enabled: settings.enabled && snapshot.ok && snapshot.mode === 'cohort' }); return A.visibleMetrics(settings, snapshot.available); },
    reset() { configure({ ...A.defaults(), enabled: false }); },
    intact(snapshot, settings) { return !settings.enabled || Boolean(status?.active); }
  };
})();
