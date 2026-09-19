import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const tool = ['safari-web-extension-packager', 'safari-web-extension-converter'].find(name => spawnSync('xcrun', ['--find', name], { stdio: 'ignore' }).status === 0);
if (!tool) {
  console.error('Safari 构建需要完整 Xcode 的 Safari Web Extension 打包工具。当前未找到；没有生成 Safari 安装应用。');
  process.exit(1);
}
const output = resolve('dist/safari');
if (existsSync(output)) {
  console.error('dist/safari 已存在，请在 Xcode 中使用现有工程；脚本不会覆盖已有工程。');
  process.exit(1);
}
const result = spawnSync('xcrun', [tool, resolve('extension'), '--project-location', output,
  '--app-name', 'AppLovin Cohort Enhancer', '--bundle-identifier', 'local.applovincohortenhancer',
  '--swift', '--macos-only', '--copy-resources', '--no-open', '--no-prompt'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
