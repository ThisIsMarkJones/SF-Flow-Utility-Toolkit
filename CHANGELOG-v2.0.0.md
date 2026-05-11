# SF Flow Utility Toolkit — v2.0.0

A major release introducing the **Scheduled Flow Explorer** feature,
amalgamated with all fixes shipped in v1.2.2 and v1.2.3.

## New feature

### Scheduled Flow Explorer

A new top-level feature that surfaces upcoming and past Schedule-Triggered
Flow runs across the org. Lives in:

- `features/scheduled-flow-explorer.js`
- `utils/scheduled-flow-calculator.js` — recurrence and next-run math
- `utils/scheduled-flow-discovery.js` — Tooling API discovery layer

Wired into the side button, settings page, and content-script load order
via the usual extension points (`manifest.json`, `ui/side-button.js`,
`utils/context-detector.js`, `utils/settings-manager.js`,
`settings/settings.html`, `settings/settings.js`,
`features/setup-tabs.js`).

## Amalgamated from prior releases

This release was branched from a baseline pre-dating v1.2.2, so two
prior fixes have been forward-ported in. Both were merged surgically
to preserve every v2.0.0-authored change.

### Forward-port 1 — v1.2.2 scoring formula

`utils/flow-health-scorer.js` is restored to the v1.2.2 implementation:

```
deduction = min( appearancePenalty + weight × log2(instanceCount + 1),  cap )
```

| Severity | Appearance | Weight | Cap |
|----------|-----------:|-------:|----:|
| High     | 1.5        | 5.5    | 22  |
| Medium   | 0.5        | 3.0    | 13  |
| Low      | 0.0        | 1.0    | 6   |
| Info     | 0.0        | 0.0    | 0   |

The pre-v1.2.2 formula (flat `weight × 1` per family, weights 5/3/1/0)
that v2.0.0 was originally branched on has been removed. v2.0.0 had
made no further changes to this file, so this is a clean wholesale
replace; no v2.0.0 logic was lost.

The behaviour described in `CHANGELOG-v1.2.2.md` (Account Verification
Flow lands in the 40–50 band, mature flows with cosmetic findings drop
proportionately) is now in effect again.

### Forward-port 2 — v1.2.3 toast z-index

`styles/toolkit.css` — `.sfut-toast` z-index moved from `100001` to
`100010`, with the explanatory comment from v1.2.3 attached. All
v2.0.0-authored CSS (Scheduled Flow Explorer rules, etc.) is untouched.

### Forward-port 3 — single-segment hostname construction in `setup-tabs.js`

Both `_getSetupHostname` and `_getLightningHostname` were using the
pre-v1.2.2 two-segment construction:

```js
return `${orgIdentifier}.${environment}.my.salesforce-setup.com`;
return `${orgIdentifier}.${environment}.lightning.force.com`;
```

This produces non-existent hostnames for any org whose Lightning or
Setup hostname doesn't carry a `.my.` segment before the suffix —
including newer developer-edition orgs (`<org>.develop.lightning.force.com`),
post-Enhanced-Domains orgs, and orgs of the form
`<org>.lightning.force.com` (no middle segment). Affected users hit
`DNS_PROBE_FINISHED_NXDOMAIN` when clicking the toolkit's Flow Trigger
Explorer or Automation Home tabs (Lightning targets) and would have
hit the same on the toolkit's Flows or Process Automation Settings
tabs from a Lightning-side starting point (Setup targets).

Replaced both functions with the v1.2.2/v1.2.3 single-segment version:

```js
const orgIdentifier = hostname.split('.')[0];
return `${orgIdentifier}.my.salesforce-setup.com`;
// or
return `${orgIdentifier}.lightning.force.com`;
```

This was validated in production v1.2.3 by an external reporter on a
dev-edition org (`learningtoflow-dev-ed.my.salesforce-setup.com` →
`learningtoflow-dev-ed.lightning.force.com`).

Both functions had the same defect, but only `_getLightningHostname`
was reported externally. `_getSetupHostname` is fixed at the same time
because it has the identical bug class and would have broken in the
same way for the same orgs starting from a Lightning-side context.

### Forward-port 4 — restored Health Modal copy toasts

During v2.0.0 development, the toast confirmations on the three
Health-Modal copy buttons were stripped (a side-effect of the toast-
behind-modal bug fixed in v1.2.3 — once toasts were visibly broken,
the calls were removed). With v1.2.3's z-index fix now ported in,
those toasts have been restored:

- `ui/flow-health-modal.js`
  - `_copyText(text)` → `_copyText(text, label = 'Copied to clipboard ✓')`
  - `_showToast` helper restored (identical to v1.2.3)
  - Three call sites in the footer click handlers now pass labels:
    "Summary copied to clipboard ✓", "JSON copied to clipboard ✓",
    "Improvement prompt copied to clipboard ✓".
- `features/flow-health-check.js`
  - The toast block inside `onSendToImprovementPrompt` (v1.2.3's
    "Improvement prompt copied" confirmation when the AI Assistant
    handler activates) has been restored verbatim.

The v2.0.0-authored simplifications in these files are preserved:
`AIPromptTemplates.assemble` → `getById`, the `metadata` parameter
removal from `_getBaseImprovementPrompt`, and the modal structure
adjustments. None of those was rolled back.

## What did *not* change from v2.0.0 as authored

- Scheduled Flow Explorer, in any of its files.
- Side-button, settings page, settings manager, and context-detector
  changes.
- `setup-tabs.js` adjustments.
- Any other feature module (api-name-generator, ai-assistant,
  comparison-exporter, canvas-search, flow-list-search,
  flow-trigger-explorer-enhancer, flow-version-manager,
  missing-description-flags).
- All other CSS, all other utilities, the manifest, the background
  script, and the icons/assets.

## Known points carried forward to v2.1.0

The following are intentionally left alone in v2.0.0 and will be
addressed in the v2.1.0 quality-of-life bundle:

- Seven near-duplicate `_showToast` helpers across feature modules
  (including the one restored in `ui/flow-health-modal.js` above).
  These will be consolidated into a single `utils/toast.js` helper
  in v2.1.0.
- Three `_escapeHtml` implementations (two regex-based, one DOM-based).
- The Version Manager's dedicated `.sfut-version-manager-toast` class
  with its top-right placement and no fade.
- Custom API name prefix expansion.
- Flow Trigger Explorer Enhancer leaving beta with Tooling API batch
  fetch.
- Side button respecting per-feature enable state.
