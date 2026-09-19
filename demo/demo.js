(() => {
  if (!location.search) history.replaceState(null, '', '/analytics/reports?accountId=demo&reportId=preview');
  const listeners = new Set();
  globalThis.chrome = { storage: { local: {
    async get(key) { return { [key]: JSON.parse(localStorage.getItem(key) || 'null') }; },
    async set(items) { for (const [key, value] of Object.entries(items)) { localStorage.setItem(key, JSON.stringify(value)); for (const fn of listeners) fn({ [key]: { newValue: value } }, 'local'); } }
  }, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
  const names = ['Date', 'Campaign ID', 'Installs', 'Spend', 'CPI', 'D1 IAP rev', 'D1 unique purchasers', 'D7 IAP rev', 'D7 unique purchasers', 'D1 total rev', 'D7 total rev'];
  let allColumns = true, run = 0;
  function draw() {
    const rows = [
      ['2026-09-07 – 09-13', 'Demo / iOS', '100', '$1,000.00', '$10.00', '$200.00', '20', `$${500 + run * 10}.00`, '25', '$240.00', '$600.00'],
      ['2026-09-07 – 09-13', 'Demo / Android', '200', '$800.00', '$4.00', '$120.00', '15', '$320.00', '28', '$200.00', '$480.00']
    ];
    const total = ['Total', '', '300', '$1,800.00', '$6.00', '$320.00', '35', `$${820 + run * 10}.00`, '53', '$440.00', '$1,080.00'];
    const included = names.map((_, i) => i).filter(i => allColumns || ![6, 8].includes(i));
    const root = document.createElement('div'); root.className = 'arco-table';
    for (const head of [true, false]) {
      const wrap = document.createElement('div'); wrap.className = head ? 'arco-table-header' : 'arco-table-body';
      const table = document.createElement('table'), group = document.createElement('colgroup');
      for (const i of included) { const col = document.createElement('col'); col.style.width = `${i === 0 ? 200 : 145}px`; group.append(col); }
      table.append(group);
      function addRow(parent, values, tag) { const tr = document.createElement('tr'); for (const i of included) { const cell = document.createElement(tag); cell.textContent = values[i]; tr.append(cell); } parent.append(tr); }
      if (head) { const thead = document.createElement('thead'); addRow(thead, names, 'th'); table.append(thead); }
      else { const tbody = document.createElement('tbody'), tfoot = document.createElement('tfoot'); rows.forEach(r => addRow(tbody, r, 'td')); addRow(tfoot, total, 'td'); table.append(tbody, tfoot); }
      wrap.append(table); root.append(wrap);
    }
    document.querySelector('#table').replaceChildren(root);
    root.querySelector('.arco-table-body').addEventListener('scroll', event => { root.querySelector('.arco-table-header').scrollLeft = event.target.scrollLeft; });
  }
  document.querySelector('#columns').onclick = () => { allColumns = !allColumns; draw(); };
  document.querySelector('#run').onclick = () => { run++; setTimeout(draw, 180); };
  draw();
})();
