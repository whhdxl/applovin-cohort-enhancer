import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
for (const dir of ['extension', 'scripts', 'tests', 'demo']) {
  for (const file of readdirSync(dir).filter(f => /\.(mjs|js)$/.test(f))) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://ads.applovin.com/*']);
for (const file of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css]) assert.ok(existsSync(`extension/${file}`));
for (const file of manifest.content_scripts[0].js) {
  const source = readFileSync(`extension/${file}`, 'utf8');
  assert.ok(!/\b(fetch|XMLHttpRequest|eval)\s*\(/.test(source), `Unexpected network/eval: ${file}`);
  assert.ok(!/innerHTML\s*=/.test(source), `Unexpected HTML injection: ${file}`);
}
console.log('Syntax, manifest, asset references and static boundary checks passed.');
