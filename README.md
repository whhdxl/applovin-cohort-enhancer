# AppLovin Cohort Enhancer

English | [简体中文](README.zh-CN.md)

A desktop browser WebExtension that adds calculated columns and color rules to AppLovin Ads Cohort reports. The current version is `0.1.6` and has no third-party runtime dependencies.

## Features

- 30 base metrics across D0, D1, D3, D7, D14, and D28: Unique Payer Rate, IAP ARPPU, and IAP/IAA/Total RPD.
- 42 growth multipliers: ROAS/RPD × three revenue types × D3/D1, D7/D3, D14/D7, D28/D14, D7/D1, D14/D1, and D28/D1.
- RPD can be renamed to Cohort ARPU while keeping Installs as the denominator.
- An **Enhanced Columns** entry next to the native Columns control, with search, individual and grouped selection, Apply, and Cancel.
- Columns whose required source fields are unavailable remain hidden without losing their selection. They reappear when those fields return. Zero denominators and invalid values keep the column visible and display `—`.
- Native Total rows are recalculated from their own base fields. Detail ratios are never averaged, and visible rows are not combined to fabricate a total.
- Settings are stored locally per account and report. Disabling enhancements or switching to Real time restores the native table.
- Per-metric color ranges use an inclusive lower bound and exclusive upper bound. Overlapping ranges are rejected, and Total rows are not colored.

Default value-band coloring is enabled: Spend is green, CPI/CPM is yellow, ARPPU is pink, and other metrics are blue. Color intensity shows magnitude only; it does not indicate quality or cohort maturity. Default coloring can be disabled under **Color Rules**. A custom rule takes priority for its metric. Cohort values continue to show **Maturity unverified**, and custom maturity-based evaluation colors remain disabled until AppLovin's cohort windows are confirmed. See [ROADMAP.md](ROADMAP.md) for validation status and known limitations.

## Load in Chrome or Edge

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, then enable Developer mode.
2. Select **Load unpacked** and choose this project's `extension/` directory. If you use the ZIP package, extract it first and select the directory containing `manifest.json`.
3. Refresh an open AppLovin Ads Reports page, switch to Cohort, and select **Enhanced Columns** next to Columns.

The extension is injected only on `https://ads.applovin.com/*` and enhances only `/analytics/reports`. The page URL must contain a recognizable `accountId`; the extension stays inactive without one. If no `reportId` is present, account-level default preferences are used.

To disable the extension for a report, clear **Enable report enhancements** in the panel and apply the change. To uninstall it, remove it from your desktop browser's extension manager.

## Safari build entry point

Safari cannot load the ZIP directly. It requires full Xcode and Apple's Safari Web Extension packaging tools. On a Mac with those tools installed, run `npm run safari`. The script prefers `safari-web-extension-packager`, supports the legacy `safari-web-extension-converter` name, and generates a macOS Xcode project under `dist/safari/`. Select your signing team in Xcode, build and run the host app, then enable the extension and grant access to the AppLovin site in Safari settings.

The script does not overwrite an existing project, install Xcode, configure signing, or change Safari security settings. Shared code supports both `browser.storage` and `chrome.storage`. Test evidence and the outstanding Safari build and device validation are tracked in [ROADMAP.md](ROADMAP.md). No installable Safari app is currently provided; the ZIP contains WebExtension source only.

## Usage

The display-mode button next to **Enhanced Columns** defaults to **Display: by metric**. It groups payer rate, ARPPU, revenue-specific RPD, and ROAS/RPD multipliers, then orders each group by cohort day. Switch to **Display: by period** to group by D0, D1, D3, and later periods; growth multipliers are grouped by their later observation day. Both modes provide a default grouping and remember independent custom layouts. Legacy drag order is migrated to period mode.

**Automatically show key metrics available in this report** is enabled by default. It displays calculable D0/D1/D3/D7/D14/D28 base metrics and ROAS multipliers; RPD multipliers are not enabled by default to avoid duplication. Manually hidden columns stay hidden. Disable automatic mode for complete manual selection. Legacy six-column defaults are upgraded automatically, while existing custom selections remain in manual mode until automatic mode is enabled in the panel.

Only columns with a valid calculation path are shown. Without a custom layout, enhanced columns are appended after native columns; scroll horizontally to view them. Drag the right edge of an enhanced header to resize it from 96 to 480 px. Double-click to restore the metric default: 116 px for base metrics and 132 px for growth multipliers. When the resize handle is focused, use Left/Right to adjust it and Home to reset it.

Drag any native or enhanced header to reposition it across the full table, or focus a header and use Alt+Left/Right. Display mode, order, and width are saved per account and report. Date remains pinned at the left and cannot be moved; every other column can move across native and enhanced columns. Native column widths remain controlled by AppLovin, and manually configured enhanced widths are preserved.

Hover over a value to inspect its formula, sources, and error details. `?` means cohort maturity is unverified; `≈` means the value was estimated from rounded ROAS or CPI. Currency symbols follow the native report. Enter percentages in color rules as displayed values, so `5` means `5%`; a growth multiplier of `1.5` means `1.50×`.

AppLovin's Save, Share, Sort, and Export features do not include enhanced columns. The extension does not call reporting APIs, upload report data, or access login credentials. Local storage contains only column selections, labels, order, widths, and color preferences.

Full-table reordering changes only the visual position on screen. It preserves native DOM order and field mapping, and AppLovin exports remain in the native order. If the table contains merged cells, full-table reordering and Date pinning are disabled to prevent header and Total misalignment.

## Development and validation

Requires Node.js 22.12+, npm, and Python 3. jsdom is used for tests only.

```sh
npm ci
npm test
npm run check
npm run package
npm run preview
```

- `npm test` covers formulas, invalid input, DOM adaptation, Total rows, refresh behavior, account isolation, Apply/Cancel, and restoration.
- `npm run check` validates JavaScript syntax, the extension manifest, asset references, and static network/HTML-injection boundaries.
- `npm run package` creates `dist/applovin-cohort-enhancer-0.1.6.zip` containing extension files only.
- `npm run preview` serves a synthetic report at `127.0.0.1:4173`. Open `/analytics/reports?accountId=demo&reportId=preview`. The demo reuses the extension source and stores demo preferences on localhost through a demo-only storage substitute.

## Documentation

- [Product requirements](docs/requirements.md) (Chinese)
- [Page adapter evidence and boundaries](docs/page-adapter.md) (Chinese)
- [Roadmap and validation log](ROADMAP.md) (Chinese)
- [Engineering conventions](AGENTS.md) (Chinese)

## Browser references

- [Port a Chrome extension to Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension): the manifest and extension APIs are shared, but each browser still requires real-world validation.
- [Packaging a Web Extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari): explains Safari host apps and Xcode project generation.
