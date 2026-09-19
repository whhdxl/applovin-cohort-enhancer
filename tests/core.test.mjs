import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/core.js';
const A = globalThis.ALX;
const row = values => Object.fromEntries(Object.entries(values).map(([id, value]) => [id, A.parseValue(value, A.fields.get(id))]));
const calc = (id, values) => A.calculate(A.byId.get(id), row(values));
test('catalog has 30 base metrics and all 42 unique growth combinations', () => {
  assert.equal(A.metrics.length, 72); assert.equal(A.byId.size, 72);
  for (const type of A.types) for (const family of ['roas', 'rpd']) for (const [hi, lo] of A.pairs) {
    const result = calc(`growth.${family}.${type}.${hi}.${lo}`, { [`${type}.rev.${hi}`]: '$150', [`${type}.rev.${lo}`]: '$100' });
    assert.equal(result.value, 1.5);
  }
});
test('real display-value regression and independent income types', () => {
  const data = { installs: '3,331', 'iap.rev.0': '$4,924.15', 'payers.0': '206' };
  assert.equal(A.format(A.byId.get('payer_rate.0'), calc('payer_rate.0', data)), '6.18%');
  assert.equal(A.format(A.byId.get('arppu.0'), calc('arppu.0', data)), '$23.90');
  assert.equal(A.format(A.byId.get('rpd.iap.0'), calc('rpd.iap.0', data)), '$1.4783');
  assert.equal(calc('rpd.iaa.0', { installs: '100', 'iaa.rev.0': '$50', 'iap.rev.0': '$100' }).value, .5);
});
test('parser rejects junk, ambiguous grouping, negative, and missing percent unit', () => {
  for (const value of ['', '--', '—', 'N/A']) assert.equal(A.parseValue(value, A.fields.get('installs')).status, 'missing');
  for (const value of ['1,23', '1e3', '-1', 'NaN', '12foo', '1.5']) assert.equal(A.parseValue(value, A.fields.get('installs')).status, 'invalid');
  assert.ok(Math.abs(A.parseValue('2.14%', A.fields.get('iap.roas.0')).value - .0214) < 1e-12);
  assert.equal(A.parseValue('2.14', A.fields.get('iap.roas.0')).status, 'invalid');
});
test('capability depends on fields, not cell values', () => {
  assert.equal(A.capability(A.byId.get('arppu.0'), new Set(['spend', 'iap.roas.0', 'payers.0'])).available, true);
  assert.equal(A.capability(A.byId.get('arppu.0'), new Set(['iap.rev.0'])).available, false);
  assert.equal(A.capability(A.byId.get('growth.roas.iap.7.3'), new Set(['iap.roas.7', 'iap.roas.3'])).available, true);
});
test('fallbacks are estimates, do not replace available direct revenue', () => {
  const data = { spend: '$1000', 'iap.roas.0': '2.14%', 'payers.0': '2' };
  assert.ok(Math.abs(calc('arppu.0', data).value - 10.7) < 1e-12); assert.equal(calc('arppu.0', data).estimate, true);
  assert.equal(calc('arppu.0', { ...data, 'iap.rev.0': '$22' }).value, 11);
  assert.equal(calc('rpd.iap.0', { cpi: '$10', 'iap.roas.0': '20%' }).value, 2);
});
test('zero numerator stays zero; zero denominator and contradictory counts fail', () => {
  assert.equal(calc('arppu.0', { 'iap.rev.0': '$0', 'payers.0': '5' }).value, 0);
  assert.equal(calc('arppu.0', { 'iap.rev.0': '$10', 'payers.0': '0' }).value, null);
  assert.equal(calc('payer_rate.0', { installs: '5', 'payers.0': '6' }).value, null);
  assert.equal(calc('rpd.iap.0', { installs: '0', cpi: '$10', 'iap.roas.0': '20%' }).value, null);
  assert.equal(calc('growth.roas.iap.7.3', { 'iap.rev.7': '$150', 'iap.rev.3': '$0', 'iap.roas.7': '3%', 'iap.roas.3': '2%' }).value, null);
});
test('invalid fields, conflicting currency and revenue mismatch are visible', () => {
  assert.equal(calc('arppu.0', { 'iap.rev.0': '$bad', 'payers.0': '5', spend: '$1000', 'iap.roas.0': '10%' }).value, null);
  assert.equal(calc('growth.roas.iap.7.3', { 'iap.rev.7': '$150', 'iap.rev.3': '€100' }).value, null);
  assert.equal(calc('rpd.total.0', { installs: '100', 'total.rev.0': '$500', 'iap.rev.0': '$100', 'iaa.rev.0': '$50' }).warnings.length, 1);
});
test('half-open rules, overlaps, zero and percentage values', () => {
  const rules = [{ target: 'ir', min: 0, max: 5, color: '#ffffff' }, { target: 'ir', min: 5, max: null, color: '#000000' }];
  assert.equal(A.validateRules(rules), ''); assert.equal(A.colorFor('ir', 5, rules), '#000000');
  assert.equal(A.colorFor('ir', 0, rules), '#ffffff'); assert.equal(A.colorFor('ir', null, rules), null);
  assert.ok(A.validateRules([...rules, { target: 'ir', min: 4, max: 6, color: '#123456' }]));
  assert.ok(A.validateRules([{ target: 'ir', min: NaN, max: null, color: '#ffffff' }]));
  assert.equal(A.textColor('#ffffff'), '#000000'); assert.equal(A.textColor('#000000'), '#ffffff');
});
test('settings preserve empty selection and isolate account/report without full URL', () => {
  assert.deepEqual(A.normalizeSettings({ version: 1, selected: [] }).selected, []);
  const one = A.scopeKey('https://ads.applovin.com/analytics/reports?accountId=a&reportId=b&reportState=private');
  assert.equal(one, 'alx:v1:ads.applovin.com:a:b');
  assert.notEqual(one, A.scopeKey('https://ads.applovin.com/analytics/reports?accountId=c&reportId=b'));
  assert.equal(A.scopeKey('https://ads.applovin.com/analytics/reports'), null);
  assert.equal(A.maturity().state, 'unknown');
});
test('old settings gain default colors while explicit choices and width bounds survive', () => {
  const settings = A.normalizeSettings({ version: 1, selected: [], rules: [], widths: { 'arppu.0': 999, 'arppu.1': 10, invalid: 200 } });
  assert.equal(settings.defaultColors, true); assert.deepEqual(settings.selected, []);
  assert.deepEqual(settings.widths, { 'arppu.0': 480, 'arppu.1': 96 });
  assert.equal(A.normalizeSettings({ ...settings, defaultColors: false }).defaultColors, false);
  assert.notEqual(A.defaultColor('iap.roas.7', 2), A.defaultColor('iap.roas.7', 20));
  assert.equal(A.defaultColor('iap.roas.7', 0), null);
  const custom = { ...settings, rules: [{ target: 'spend', min: 100, max: 200, color: '#123456' }] };
  assert.equal(A.cellColor('spend', 150, custom, true), '#123456');
  assert.equal(A.cellColor('spend', 300, custom, true), null);
});
test('automatic report metrics adapt, remember exclusions and migrate legacy defaults', () => {
  const settings = A.defaults(), fields = new Set(['installs','iap.rev.0','payers.0','iap.rev.1','iap.rev.7']);
  const ids = () => A.visibleMetrics(settings, fields).map(m => m.id);
  assert.ok(ids().includes('arppu.0')); assert.ok(ids().includes('rpd.iap.0'));
  assert.ok(ids().includes('growth.roas.iap.7.1')); assert.ok(!ids().includes('growth.rpd.iap.7.1'));
  settings.overrides['arppu.0'] = false; fields.delete('payers.0'); fields.add('payers.0');
  assert.ok(!ids().includes('arppu.0'));
  assert.equal(A.normalizeSettings({ version: 1, selected: A.defaults().selected }).autoSelect, true);
  assert.equal(A.normalizeSettings({ version: 1, selected: ['arppu.0'] }).autoSelect, false);
});
test('display grouping defaults to category, period groups days, legacy order retained for period', () => {
  const settings = A.defaults();
  const category = A.orderedIds(settings).map(id => A.byId.get(id));
  assert.deepEqual(category.slice(0, 6).map(m => m.id), A.days.map(d => `payer_rate.${d}`));
  const period = A.orderedIds({ ...settings, displayMode: 'period' }).map(id => A.byId.get(id));
  assert.ok(period.every((m, i) => !i || period[i - 1].day <= m.day));
  const old = A.normalizeSettings({ version: 1, order: ['arppu.7', 'arppu.0'] });
  assert.equal(old.displayMode, 'category'); assert.deepEqual(old.order, []);
  assert.deepEqual(old.orders.period, ['arppu.7', 'arppu.0']);
});
test('saved category-shaped order cannot override period grouping', () => {
  const settings = A.defaults();
  const categoryOrder = A.orderedIds(settings);
  const result = A.orderedIds({ ...settings, displayMode: 'period', order: categoryOrder }).map(id => A.byId.get(id));
  assert.ok(result.every((m, i) => !i || result[i - 1].day <= m.day));
  const reversed = [...categoryOrder].reverse();
  const groups = A.orderedIds({ ...settings, order: reversed }).map(id => A.byId.get(id).group);
  assert.equal(groups.filter((g, i) => i === 0 || g !== groups[i - 1]).length, new Set(groups).size);
});
