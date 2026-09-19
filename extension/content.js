(() => {
  'use strict';
  const A = globalThis.ALX;
  if (A.started) return;
  A.started = true;
  const doc = document, renderer = A.adapter.renderer(doc, saveWidth, saveOrder);
  const extensionAPI = globalThis.browser?.storage ? globalThis.browser : globalThis.chrome;
  const storage = extensionAPI?.storage?.local;
  let settings = A.defaults(), scope = null, snapshot = { ok: false }, toolbar = null, modeButton = null, panel = null;
  let timer, stopped = false, revision = 0, loadingScope = false, lastSignature = '', oldRoot = null;
  let query = location.search, awaitingReport = false, pendingSignature = '', tableVersion = 0, pendingVersion = 0, sawLoading = false;
  const observe = () => observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeOldValue: true, attributeFilter: ['class', 'style', 'aria-checked', 'aria-busy', 'checked'] });
  function mutate(fn) {
    observer.disconnect();
    try { return fn(); } finally { if (!stopped) observe(); }
  }
  function schedule() { if (!stopped) { clearTimeout(timer); timer = setTimeout(refresh, 100); } }
  async function saveWidth(id, width) {
    if (!scope || !storage) return;
    const savedScope = scope;
    settings = { ...settings, widths: { ...settings.widths, [id]: width } };
    try { await storage.set({ [savedScope]: settings }); }
    catch { if (scope === savedScope && toolbar) { toolbar.textContent = '增强列 · 列宽未保存'; toolbar.title = '列宽仅本次生效；请刷新页面后重试保存'; } }
  }
  async function saveOrder(source, target, tableOrder) {
    if (!scope || !storage) return;
    const savedScope = scope;
    const order = tableOrder ? settings.order : A.moveMetric(settings, source, target);
    settings = { ...settings, tableOrders: tableOrder ? { ...settings.tableOrders, [settings.displayMode]: tableOrder } : settings.tableOrders, order, orders: { ...settings.orders, [settings.displayMode]: order } };
    lastSignature = ''; schedule();
    try { await storage.set({ [savedScope]: settings }); }
    catch { if (scope === savedScope && toolbar) { toolbar.textContent = '增强列 · 顺序未保存'; toolbar.title = '本次移动已生效，但未保存；刷新页面后重试'; } }
  }
  function openPanel() {
    if (panel || loadingScope) return;
    panel = A.settingsPanel(doc, settings, () => snapshot, async value => {
      const savedScope = scope;
      if (!savedScope || !storage) throw new Error('Storage unavailable');
      await storage.set({ [savedScope]: value });
      if (savedScope !== scope) return;
      settings = value; lastSignature = ''; schedule();
    }, () => { panel = null; });
  }
  function ensureToolbar() {
    if (!snapshot.button?.isConnected) { toolbar?.remove(); toolbar = null; modeButton?.remove(); modeButton = null; return; }
    if (toolbar?.isConnected && toolbar.previousElementSibling !== snapshot.button) snapshot.button.after(toolbar);
    if (!toolbar?.isConnected) {
      toolbar = doc.createElement('button'); toolbar.type = 'button'; toolbar.className = 'alx-toolbar-button';
      toolbar.dataset.alxOwned = 'toolbar'; toolbar.addEventListener('click', openPanel);
      snapshot.button.after(toolbar);
    }
    if (!modeButton?.isConnected) {
      modeButton = doc.createElement('button'); modeButton.type = 'button'; modeButton.className = 'alx-toolbar-button alx-display-mode';
      modeButton.dataset.alxOwned = 'display-mode';
      modeButton.addEventListener('click', async () => {
        if (!scope || !storage || loadingScope) return;
        const savedScope = scope, prior = settings;
        const displayMode = settings.displayMode === 'period' ? 'category' : 'period';
        const orders = { ...settings.orders, [settings.displayMode]: [...settings.order] };
        const nextSettings = { ...settings, displayMode, orders, order: orders[displayMode] || [] };
        modeButton.disabled = true;
        try {
          await storage.set({ [savedScope]: nextSettings });
          if (scope !== savedScope) return;
          settings = nextSettings; panel?.close(); lastSignature = ''; schedule();
        } catch {
          if (scope === savedScope) { settings = prior; modeButton.title = '展示类型未保存，请刷新页面后重试'; }
        } finally { if (modeButton) modeButton.disabled = false; }
      });
    }
    if (modeButton.previousElementSibling !== toolbar) toolbar.after(modeButton);
    modeButton.textContent = settings.displayMode === 'period' ? '展示：按周期' : '展示：按指标';
    modeButton.title = '点击切换按指标种类／按 D0、D1、D3 等周期排列；两种模式分别保存拖拽顺序';
    modeButton.setAttribute('aria-label', modeButton.textContent + '，点击切换展示类型');
    const count = snapshot.available ? A.visibleMetrics(settings, snapshot.available).length : 0;
    const status = !scope ? '无法确认账号，未启用' : !storage ? '本地存储不可用' : !snapshot.ok ? snapshot.reason
      : snapshot.mode !== 'cohort' ? '仅支持 Cohort 模式' : !settings.enabled ? '已关闭' : `显示 ${count} 列；周期成熟度待确认`;
    toolbar.textContent = settings.enabled ? `增强列${snapshot.ok && snapshot.mode === 'cohort' ? ` · ${count}` : ''}` : '增强列 · 已关闭';
    toolbar.title = status;
    toolbar.dataset.error = String(!snapshot.ok || !scope || !storage);
  }
  async function refresh() {
    if (stopped) return;
    const onReport = /^\/analytics\/reports\/?$/.test(location.pathname);
    const nextScope = onReport ? A.scopeKey(location.href) : null;
    if (nextScope !== scope) {
      scope = nextScope; revision++; const token = revision; loadingScope = true;
      mutate(() => { renderer.reset(); toolbar?.remove(); toolbar = null; modeButton?.remove(); modeButton = null; panel?.close(); });
      settings = A.defaults(); lastSignature = ''; oldRoot = null; awaitingReport = false; sawLoading = false;
      try {
        const saved = scope && storage ? await storage.get(scope) : {};
        if (token !== revision || stopped) return;
        settings = A.normalizeSettings(saved[scope]);
      } catch { settings = { ...A.defaults(), enabled: false }; }
      loadingScope = false;
    }
    if (!onReport) { query = location.search; mutate(() => { renderer.reset(); toolbar?.remove(); toolbar = null; modeButton?.remove(); modeButton = null; }); return; }
    const next = A.adapter.discover(doc);
    // URL state may describe layout or draft filters, not a new report response.
    // Scope changes are handled above; Run/loading and native DOM drive invalidation.
    query = location.search;
    if (awaitingReport && next.reason === '报表正在加载') sawLoading = true;
    if (awaitingReport && next.ok && (sawLoading || next.root !== oldRoot || next.signature !== pendingSignature || tableVersion > pendingVersion)) awaitingReport = false;
    snapshot = awaitingReport ? { ...next, ok: false, reason: '等待原生报表刷新完成' } : next;
    if (loadingScope) return;
    mutate(() => {
      ensureToolbar();
      const signature = snapshot.ok ? snapshot.signature : snapshot.reason;
      const intact = !settings.enabled || !snapshot.ok || snapshot.mode !== 'cohort' || A.visibleMetrics(settings, snapshot.available).map(m => m.id)
        .every(id => [...snapshot.headRow.querySelectorAll('[data-alx-metric]')].some(cell => cell.dataset.alxMetric === id)
          && snapshot.tables.every(table => table.querySelector(`col[data-alx-metric="${id}"]`))
          && snapshot.rows.every(row => [...row.element.querySelectorAll('[data-alx-metric]')].some(cell => cell.dataset.alxMetric === id)));
      if (signature !== lastSignature || snapshot.root !== oldRoot || !intact) {
        renderer.render(snapshot, { ...settings, enabled: settings.enabled && Boolean(scope) && Boolean(storage) });
        lastSignature = signature; oldRoot = snapshot.root || oldRoot;
        panel?.refresh();
      }
    });
  }
  const observer = new MutationObserver(records => {
    if (awaitingReport && records.some(r => r.type === 'attributes' && r.target.closest?.('[data-testid="report-table-area"]') &&
      ((r.attributeName === 'class' && `${r.oldValue} ${r.target.className}`.includes('arco-spin-loading')) ||
       (r.attributeName === 'aria-busy' && (r.oldValue === 'true' || r.target.getAttribute('aria-busy') === 'true'))))) sawLoading = true;

    if (records.some(r => {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      return !el?.closest('[data-alx-owned]') && el?.closest('tbody, tfoot') && (r.type === 'characterData' || r.type === 'childList');
    })) tableVersion++;
    if (records.some(r => {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (el?.closest('[data-alx-owned]')) return false;
      if (r.type === 'childList' && !r.removedNodes.length && [...r.addedNodes].every(n => n.nodeType === 1 && n.matches('[data-alx-owned]'))) return false;
      return el?.closest('[data-testid="report-table-area"]') || r.type === 'childList';
    })) schedule();
  });
  const onChange = event => { if (!event.target.closest?.('[data-alx-owned]')) schedule(); };
  const onClick = event => {
    const button = event.target.closest?.('button');
    if (button && !button.closest('[data-alx-owned]') && A.normalize(button.textContent).replace(/^\W+/, '') === 'run') {
      pendingSignature = snapshot.signature; pendingVersion = tableVersion; awaitingReport = true; sawLoading = false;
      mutate(() => renderer.reset()); lastSignature = ''; schedule();
    }
  };
  doc.addEventListener('change', onChange, true); doc.addEventListener('click', onClick, true);
  // SPA navigation does not always emit popstate; this only checks URL/root identity.
  const navigation = setInterval(() => {
    const onReport = /^\/analytics\/reports\/?$/.test(location.pathname);
    if (location.search !== query || (scope && !onReport) || (onReport && !toolbar?.isConnected)) schedule();
  }, 500);
  const onStorage = (changes, area) => {
    if (area === 'local' && scope && changes[scope]) { settings = A.normalizeSettings(changes[scope].newValue); lastSignature = ''; schedule(); }
  };
  extensionAPI?.storage?.onChanged?.addListener(onStorage);
  A.stop = () => {
    stopped = true; clearInterval(navigation); clearTimeout(timer); observer.disconnect(); renderer.reset();
    toolbar?.remove(); modeButton?.remove(); panel?.close(); doc.removeEventListener('change', onChange, true); doc.removeEventListener('click', onClick, true);
    extensionAPI?.storage?.onChanged?.removeListener(onStorage);
  };
  refresh();
})();
