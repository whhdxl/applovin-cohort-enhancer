# AppLovin Cohort Enhancer

[English](README.md) | 简体中文

为 AppLovin Ads 的 Cohort 报表增加计算列和颜色设置的桌面浏览器 WebExtension。当前版本 `0.1.7`，无第三方运行时依赖。

## 当前功能

- 30 个基础指标：D0、D1、D3、D7、D14、D28 的 Unique 付费率、IAP ARPPU、IAP／IAA／Total RPD。
- 42 个增长系数：ROAS／RPD × 三类收入 × D3/D1、D7/D3、D14/D7、D28/D14、D7/D1、D14/D1、D28/D1。
- 6 个留存衰退系数：D3/D1、D7/D3、D14/D7、D28/D7、D7/D1、D28/D1。
- RPD 可统一改名为同期群 ARPU，分母仍为 Installs。
- 原生 Columns 附近的「增强列」入口，支持搜索、逐列选择、分组选择、应用和取消。
- 缺少必要字段时隐藏对应列，保留选择；字段恢复后自动显示。零分母或异常数据保留列，单元格显示 `—`。
- 原生 Total 基础字段独立重算；不平均明细比例，不用当前可见行拼接汇总。
- 设置按账号、报表保存在本机；关闭增强或切换 Real time 时恢复原生表格。
- 支持按具体指标配置颜色区间，含下限、不含上限；拒绝重叠区间。Total 不着色。

默认启用数值分档填色：花费为绿色，CPI／CPM 为黄色，ARPPU 为粉色，其他指标为蓝色，颜色深浅只表示大小，不表示好坏或成熟度。可在「颜色规则」关闭默认填色。已有自定义规则优先，该指标不会叠加默认颜色。周期数据仍带「成熟度待确认」提示，自定义周期评价色仍需成熟度确认。详细验收状态与限制见 [ROADMAP.md](ROADMAP.md)。

## 加载 Chrome／Edge 扩展

1. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`，开启开发者模式。
2. 点 **Load unpacked／加载已解压的扩展程序**，选择本项目的 `extension/` 目录。若使用 ZIP，先解压并选择包含 `manifest.json` 的目录。
3. 刷新已打开的 AppLovin Ads Reports 页面，选择 Cohort，点击 Columns 旁的「增强列」。

扩展只在 `https://ads.applovin.com/*` 注入，实际增强仅处理 `/analytics/reports`。页面 URL 需包含可识别的 `accountId`；没有账号标识时不应用增强。无 `reportId` 时使用账号默认偏好。

关闭增强可在面板中取消「启用报表增强」后应用。卸载可在桌面浏览器 WebExtension 管理页移除此扩展。

## Safari 构建入口

Safari 不能直接加载此 ZIP，需要完整 Xcode 与 Apple 的 Safari Web Extension 打包工具。在具备工具的 Mac 上运行 `npm run safari`，脚本优先使用 `safari-web-extension-packager`，兼容旧名 `safari-web-extension-converter`，生成 `dist/safari/` 中的 macOS Xcode 工程。随后在 Xcode 选择自己的签名团队，构建并运行宿主应用，再在 Safari 扩展设置中启用并授权 AppLovin 站点。

脚本不覆盖已有工程、不安装 Xcode、不设置签名、不修改 Safari 安全设置。共用代码支持 `browser.storage` 与 `chrome.storage`；测试证据及未完成的 Safari 构建／真机验证见 [ROADMAP.md](ROADMAP.md)。本次没有可安装的 Safari 应用，ZIP 是 WebExtension 源码包。

## 使用说明

「增强列」右侧的展示类型按钮默认显示「展示：按指标」：先按付费率、ARPPU、各收入类型 RPD、ROAS／RPD 倍数组合、留存衰退系数分组，再按周期排列。点击切为「展示：按周期」，按 D0、D1、D3 等分组；各类倍数按后期观察点归组。展示类型提供默认分组；可手动拖动全表列自定义布局，两种模式分别记住自定义顺序，首次进入使用各自默认顺序。旧版拖拽顺序迁移到按周期模式。

默认开启「跟随报表自动展示重点指标」：显示当前可计算的 D0／D1／D3／D7／D14／D28 基础指标、ROAS 增长系数及留存衰退系数；RPD 增长系数默认不重复开启。手动取消的列会记住。可关闭自动模式，完全手选。旧版默认六列配置自动升级；已有自定义选择保留手动模式，可在面板开启自动模式。

留存衰退系数按后期留存除以前期留存计算。例如 `0.65×` 表示后期留存为前期的 65%，即相对衰退 35%。缺少任一原生留存列时不显示对应系数；前期留存为零时显示 `—`。

只显示当前有计算路径的列，未定制时增强列追加在原生列之后，向右滚动查看。增强列表头右边界可拖拽调宽（96–480px），双击恢复该指标默认宽度（基础指标 116px，增长／留存系数 132px）；聚焦手柄后可用左右方向键微调、Home 恢复。

拖动原生或增强列表头可跨列调整显示位置，或聚焦表头后使用 Alt＋左右方向键移动。展示类型、顺序和宽度按账号及报表保存；Date 固定在最左侧，不参与换位；其他列均可跨原生／增强列移动。原生列宽仍用官方控件，手动调过的增强列宽度会保留。

悬浮数值查看公式、来源与异常说明。`?` 表示成熟度待确认；`≈` 表示从已舍入的 ROAS 或 CPI 估算。金额保留原生币种标识。颜色规则中的百分数直接填写显示值，例如 `5` 表示 `5%`；增长系数 `1.5` 表示 `1.50×`。

官方保存、分享、排序及导出不包含增强列。插件不调用报表接口、不上传报表、不访问登录凭据；本地存储仅保存列选择、名称、顺序、列宽和颜色偏好。

全表调序只调整屏幕显示位置，保留原生 DOM 列顺序和字段映射；官方导出仍使用官方顺序。若表格存在合并单元格，本版不应用全表换位及 Date 固定，以免表头与汇总错位。

## 开发与验证

需要 Node.js 22.12+、npm 和 Python 3。jsdom 仅用于测试。

```sh
npm ci
npm test
npm run check
npm run package
npm run preview
```

- `npm test`：公式、异常输入、DOM 适配、Total、刷新、账号隔离、应用／取消和恢复测试。
- `npm run check`：JavaScript 语法、清单及资源引用、静态网络与 HTML 注入边界检查。
- `npm run package`：生成 `dist/applovin-cohort-enhancer-0.1.7.zip`，仅包含扩展文件。
- `npm run preview`：在 `127.0.0.1:4173` 提供合成报表，访问 `/analytics/reports?accountId=demo&reportId=preview`。演示页复用扩展源码，通过仅存在于 demo 的存储替身将演示偏好保存在 localhost。

## 文档入口

- [产品需求](docs/requirements.md)
- [页面适配证据与边界](docs/page-adapter.md)
- [进度与验收记录](ROADMAP.md)
- [工程约定](AGENTS.md)

## 浏览器依据

- [Microsoft Edge 的 Chrome 扩展移植说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)：共用清单与扩展 API，仍需浏览器实测。
- [Apple Safari Web Extension 打包说明](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)：Safari 宿主应用和 Xcode 工程生成方式。
