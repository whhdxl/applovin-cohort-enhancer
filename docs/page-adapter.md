# 页面适配证据与边界

## 新版 MUI 网格适配（v0.1.11）

2026-10-30 14:06（北京时间），在用户已打开的报表中通过 Chrome DevTools Elements 检查到：

- 报表区域仍为 `[data-testid="report-table-area"]`，插件入口显示「未识别当前表格结构」。
- 原 Arco 表格已替换为 `.MuiDataGrid-root`，内部 `.MuiDataGrid-main[role="grid"]` 提供 `aria-colcount` 和 `aria-rowcount`。
- 滚动容器为 `.MuiDataGrid-virtualScroller`，另有 `.MuiDataGrid-scrollbar--horizontal`。
- 表头位于 `.MuiDataGrid-columnHeaders`；数据行位于 `.MuiDataGrid-virtualScrollerRenderZone[role="rowgroup"]`。
- 明细行为 `div[role="row"][data-id][data-rowindex]`；单元格为 `div[role="gridcell"][data-field][data-colindex]`，宽度使用内联 `--width`。
- 底部汇总位于 `.MuiDataGrid-pinnedRows--bottom`，行标识为 `data-id="__summary"`，不能继续依赖 `tfoot`。
- 缩小视口后，Elements 中明细行只保留部分列节点，确认存在列虚拟化。不能把当前 DOM 中未渲染的列直接当作报表取消选择的列，也不能混合不同 Run 的缓存值。

2026-10-31 00:47（北京时间），用户手动处理 Console 安全提示后完成后续只读检查与现场验收：

- 最新工具栏使用文字为 `view_column` 的图标按钮；模式为文本为 Cohort／Real time 的 combobox。适配同时保留旧按钮和 radio 识别。
- 从当前网格 DOM 的 React fiber 向上定位含 `columns`、`rows`、`pinnedRows`、`apiRef` 的已提交节点；检查 current 分支，避免读取 React alternate 的旧模型。没有遍历账号、登录或其他应用状态。
- 原生列 `field` 关联行值，`headerName` 关联现有指标定义。已核实 Installs 对应 `conversions`、Spend 对应 `advRevenue`、D1 留存对应 `ret1d` 等。没有按固定列下标取数。
- 明细和汇总中的已核实百分比字段是百分数形式的数字字符串，例如合成模型中的 `20` 表示 20%，不表示 2000%。金额模型没有已核实的币种代码，增强金额不补币种符号。
- `updateColumns` 注册禁用原生排序／筛选／导出的增强列，`valueGetter` 根据该行当前基础字段计算；`setColumnIndex` 和 `setPinnedColumns` 负责展示顺序与时间固定。原生行模型不被修改，仍由 MUI 负责虚拟滚动。
- MAIN 运行文件由共享 core 和 mui-main 源码合并生成；隔离环境负责设置和工具栏。事件桥仅传字段能力、版本状态、显示偏好及列宽／列序操作，不传报表行。初次现场加载发现分文件入口的 core 未在 MAIN 中可用，已改成自包含入口并验证；不推断浏览器内部原因。
- Run 先撤下旧列；新行模型、加载周期或网格替换后恢复。关闭增强恢复着色、原生顺序和固定状态；注入列定义隐藏且禁止导出，在页面重载后清除。
- 当前 Chrome 实测显示 32 个增强列，两种模式实际列序不同；滚动到最右侧 Date 仍固定，增强值居中且填色，Total 不填色。Run 时显示等待，返回后恢复 32 列。最终构建刷新后启动成功；增强列调宽 132→140→132px 已验证。测试后恢复原展示模式、横向滚动位置和视口设置。

MUI GridApi 方法与 valueGetter 参数对照了 [MUI GridApi](https://mui.com/x/api/data-grid/grid-api/) 和 [列定义文档](https://mui.com/x/react-data-grid/column-definition/)；执行环境对照了 [Chrome Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。React fiber 定位是现场检查得到的站点内部适配，不是这些官方 API 的一部分，未来变更仍可能需要更新。未读取凭据或网络响应，未保存真实报表到仓库。

## 旧版 Arco 已检查的真实 DOM

通过 Chrome DevTools Elements 树只读检查了当前 AppLovin Ads Reports 页面。可访问性树用于控件定位；以下表格结构来自 Elements，不是从可访问性角色推断。

- 报表区域为 `[data-testid="report-table-area"]`，包含 Columns、Cohort／Real time 与 `.arco-table`。
- 使用 Arco 分离表头和表体：`.arco-table-header > table` 与 `.arco-table-body > table`。
- 两张表均有 `colgroup`，其中 `col` 有明确像素宽度。
- 表头为 `thead > tr > th`，明细为 `tbody > tr > td`，汇总在 `tfoot > tr`。
- 汇总的维度单元格可能为空；另有绝对定位的 Total 标签，不能以行文字包含 Total 作为唯一识别方式。
- 检查到的表头／单元格没有可直接使用的稳定指标 ID，因此以已核实的表头文字建立字段映射。
- 页面提供 Inter 字体与 `--bg-base`、`--bg-fill-hover`、`--bg-fill-pressed` 等颜色变量。

未读取或保存网络响应、登录凭据、完整查询 URL。未修改官方报表或投放配置。

## 旧版 Arco 适配方式

每次根据当前表头重建字段映射，将行值归一化后交给独立计算层。新增单元格和 col 均带 `data-alx-owned`；只对这类节点进行移除。样式恢复会检查当前值是否仍为插件写入值，避免覆盖原生后续修改。

MutationObserver 合并报表变更，写入时暂停监听以忽略插件自身变更；原生移除增强节点仍触发恢复，处理文本更新、行复用和表格重建。Run 会先移除旧计算结果，等待表体更新或可观察加载周期结束（包括相同数据返回）；SPA URL 变化由轻量轮询发现。同一账号／报表内，URL 参数变化本身不表示报表开始刷新，布局或草稿参数变化不清空现有增强；已有 Run 等待状态也不会因此解除。账号／报表变化重新读取独立偏好。

原生表头和表体的宽度同步增加。空维度或仅跨维度的 colspan 可接受；跨指标合并、重复指标、多层表头、列宽缺失或结构不一致时暂停增强并在入口提示。

## 明确限制

1. Arco 读取当前 DOM 原生字段；MUI 读取当前网格已选字段及已加载行模型，屏幕外虚拟列不按缺字段处理。两者均不抓取额外接口。
2. 同期群窗口端点、整周完成条件与数据回传延迟尚未核实。当前全部周期指标显示成熟度未知，禁用自定义周期评价色；默认数值分档填色可显示，不能把颜色或非零远期值视为已成熟。
3. 不支持任意币种格式或科学计数法；异常输入不计算。不同显式币种不混算。
4. 负收入暂作异常显示，需核验官方退款／调整语义后再扩展。
5. 支持已检查的单层 Arco 表格和 MUI 网格；React 内部定位或网格 API 变化会暂停增强。Safari／Edge、真实分页、完整浏览器冷启动及全部拖拽路径仍需各自实测。
6. 已加载的旧报表在没有任何可观察刷新信号时无法确认已完成相同结果的重跑，插件宁可继续等待，不恢复可能过期的值。
7. 增强列不注册官方排序、导出或保存协议。

本地 jsdom 及 Chrome 演示验证不等于真实站点扩展验收；具体完成状态见 [进度文档](../ROADMAP.md)。


## v0.1.5 全表布局

原生表头、明细和 Total 使用相同水平位移调整视觉顺序，DOM 和 colgroup 保留原始索引。Date 使用 sticky 和明确不透明背景固定；增强列宽变化后重算位移。每次重绘前恢复插件写入的样式与事件，避免重复注册。指针拖动与官方普通点击分离，完成拖动时抑制误触点击排序。合并单元格暂不使用该布局。

视觉顺序与 DOM 阅读顺序不同；键盘可用 Alt＋左右方向键调序，但辅助技术仍读取原生 DOM 顺序。真实站点的第三方样式、其他固定列和原生拖宽行为仍需回归。
