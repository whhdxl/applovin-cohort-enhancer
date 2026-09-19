import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
export const source = name => readFileSync(new URL(`../extension/${name}`, import.meta.url), 'utf8');
export const headers = ['Week', 'Campaign ID', 'Installs', 'Spend', 'CPI', 'D0 IAP rev', 'D0 unique purchasers', 'D1 IAP rev', 'D1 unique purchasers', 'D3 IAP rev', 'D7 IAP rev', 'D7 unique purchasers', 'D1 total rev', 'D7 total rev'];
export const values = ['2026-09-07 - 2026-09-13', 'demo-1', '100', '$1,000.00', '$10.00', '$100.00', '10', '$200.00', '20', '$300.00', '$500.00', '25', '$240.00', '$600.00'];
export function fixture({ names = headers, rows = [values], total = values, url = 'https://ads.applovin.com/analytics/reports?accountId=demo&reportId=one', content = false, api = 'chrome' } = {}) {
  const tr = data => `<tr>${data.map(v => `<td class="arco-table-td">${v}</td>`).join('')}</tr>`;
  const cols = names.map(() => '<col style="width:100px">').join('');
  const dom = new JSDOM(`<!doctype html><html><body><button>Run</button><div data-testid="report-table-area">
    <button>Columns</button><label class="arco-radio arco-radio-checked"><input type="radio" name="mode" checked>Cohort</label>
    <label class="arco-radio"><input type="radio" name="mode">Real time</label>
    <div class="arco-table"><div class="arco-table-header"><table><colgroup>${cols}</colgroup><thead><tr>${names.map(n => `<th>${n}</th>`).join('')}</tr></thead></table></div>
    <div class="arco-table-body"><table><colgroup>${cols}</colgroup><tbody>${rows.map(tr).join('')}</tbody><tfoot>${total ? tr(total) : ''}</tfoot></table></div></div></div></body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window: w } = dom;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const saved = {}, listeners = new Set();
  w[api] = { storage: { local: { async get(key) { return { [key]: saved[key] }; }, async set(items) { Object.assign(saved, structuredClone(items)); } }, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
  for (const name of ['core.js', 'adapter.js', 'ui.js', ...(content ? ['content.js'] : [])]) w.eval(source(name));
  return { dom, w, doc: w.document, A: w.ALX, saved, close() { w.ALX.stop?.(); w.close(); } };
}
export const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));
export function removeColumn(doc, index) {
  for (const row of doc.querySelectorAll('tr')) row.children[index]?.remove();
  for (const group of doc.querySelectorAll('colgroup')) group.children[index]?.remove();
}
