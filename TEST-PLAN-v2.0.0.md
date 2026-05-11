# SF Flow Utility Toolkit — v2.0.0 Test Plan

This plan validates the v2.0.0 release. It's organised so that
**Section A** (the new Scheduled Flow Explorer feature) and
**Section B** (the three forward-ports from v1.2.2 / v1.2.3) are the
must-pass checks; **Section C** is a regression sweep over everything
else; **Section D** is a quick smoke test you can run on a second org
or sandbox.

If you only have time for one pass, run Sections A + B + the relevant
regression items in C for any feature you actively use.

## Setup

1. Unpack `SF_Flow_Utility_Toolkit_v2.0.0.zip` to a folder on disk.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**.
3. **Remove** any older toolkit version that's currently loaded.
4. Click **Load unpacked**, point it at the v2.0.0 folder.
5. Confirm the version reads `2.0.0` on the extension card.
6. Open a Salesforce org with at least:
   - one Schedule-Triggered Flow (active),
   - one Record-Triggered Flow (active),
   - one Flow with known Health Check findings (ideally something with
     multiple High/Medium severity issues — your "Account Verification
     Flow" is the reference flow from v1.2.2 testing).

If any of those flows aren't available, note it against the relevant
section rather than skipping.

---

## Section A — Scheduled Flow Explorer (new feature)

**A1. Discovery**
- [ ] Open Setup → Flows. The toolkit side button surfaces a
      "Scheduled Flow Explorer" entry.
- [ ] Click it. The Scheduled Flow Explorer modal opens with no
      console errors.

**A2. Listing**
- [ ] Active Schedule-Triggered Flows in the org appear in the list.
- [ ] Each row shows the flow label, schedule cadence (e.g. "Daily at
      02:00", "Weekly on Mon"), and the next scheduled run time.
- [ ] Inactive Schedule-Triggered Flows are either omitted or clearly
      marked (whichever the feature is designed to do).

**A3. Recurrence math**
- [ ] For at least one flow, hand-verify the next-run time is correct
      (compare against the flow's schedule definition in Setup).
- [ ] Times respect the user's timezone — if your org user is in a
      non-UTC timezone, the displayed times match local clock, not UTC.

**A4. Detail / day views**
- [ ] If the feature offers a per-flow detail modal or per-day modal,
      open one and confirm it renders without console errors.
- [ ] Closing those modals returns you to the main list cleanly.

**A5. Toast feedback inside SFE**
- [ ] If SFE shows toasts (e.g. on data refresh, errors, "no scheduled
      flows found"), confirm they appear bottom-right and remain visible
      while the SFE modal is open. *(See B2.)*

**A6. Empty state**
- [ ] In an org with no Schedule-Triggered Flows, the modal shows an
      appropriate empty state rather than crashing or showing a blank
      list.

---

## Section B — Forward-ports (must-pass)

### B1. v1.2.2 scoring formula is back

Pre-condition: have a flow with several known findings (use your
Account Verification Flow if available).

- [ ] Open the flow, run **Health Check** from the side button.
- [ ] Confirm the score lands in the band v1.2.2 produced. Reference
      points from `CHANGELOG-v1.2.2.md`:
      - Pristine flow: **100**
      - Small flow with a few missing descriptions: ~**95**
      - Mature flow with many cosmetic findings: low-mid **80s**
      - Account Verification-style flow (9 DML / 19 query gaps etc):
        **40–50** band
      - "Disaster" flow with DML/queries in loops: **high 30s**
- [ ] Inspect a high-severity family in the report. Its `scoreImpact`
      shows fractional values where appropriate (e.g. `-16.6` for 9
      instances at High), not flat integers like `-5`.
- [ ] Confirm the score does **not** revert to v1.2.1-style numbers
      (Account Verification Flow stuck around 78, mature-flow finding
      ~97 — those would mean the old formula slipped back in).

### B2. v1.2.3 toast z-index fix carried forward

- [ ] Run **Health Check** on any flow. While the modal is open, click
      **Send to Improvement Prompt**. Toast "Improvement prompt copied
      to clipboard ✓" appears bottom-right, **on top of** the modal
      overlay (not dimmed underneath it).
- [ ] Open any other modal-using feature (Comparison Exporter, API
      Name Generator, AI Assistant) and trigger an action that
      produces a toast from that feature. Toast renders above the
      modal overlay in every case.
- [ ] Close all modals and trigger any toast (e.g. refresh Missing
      Description Flags). Toast still renders correctly at
      bottom-right with the same fade animation as before.

### B3. Restored Health Modal copy toasts

Open Health Check for any flow, then with the modal open:

- [ ] Click **Copy Summary**. Toast appears: "Summary copied to
      clipboard ✓". Paste into a text editor — the markdown summary is
      on the clipboard.
- [ ] Click **Copy JSON**. Toast appears: "JSON copied to clipboard ✓".
      Paste — the raw JSON report is on the clipboard.
- [ ] Click **Send to Improvement Prompt**. Toast appears: "Improvement
      prompt copied to clipboard ✓". The AI Assistant should also
      activate (existing v2.0.0 behaviour). Paste — the improvement
      prompt is on the clipboard.
- [ ] Each of the three toasts renders **above** the open Health Modal
      overlay (this is the combined check for B2 + B3).

### B4. v2.0.0 prompt-template changes still work

- [ ] The Send-to-Improvement-Prompt path doesn't error. Console is
      clean. The AI Assistant receives the prompt successfully.
      *(This validates that restoring the toast didn't undo v2.0.0's
      `AIPromptTemplates.getById` swap.)*

### B5. Setup-tabs hostname construction (forward-ported from v1.2.2)

These tabs depend on the toolkit constructing the right Lightning or
Setup hostname for the user's org. The pre-v1.2.2 logic was buggy
(two-segment construction); v1.2.2 fixed it; v2.0.0 had regressed to
the pre-fix logic and is now corrected.

For each test, open DevTools → Network panel before clicking, so you
can see the exact URL that the click navigates to.

- [ ] On a Setup-side page (`<org>.my.salesforce-setup.com/lightning/setup/...`):
      - [ ] Click the toolkit's **Flow Trigger Explorer** tab. URL
            navigated to is `https://<org>.lightning.force.com/interaction_explorer/flowExplorer.app`
            — note: **no `.my.`** between `<org>` and `lightning.force.com`.
            Page loads successfully (not `DNS_PROBE_FINISHED_NXDOMAIN`).
      - [ ] Click the toolkit's **Automation Home** tab. URL navigated
            to is `https://<org>.lightning.force.com/lightning/app/standard__FlowsApp`.
            Page loads.

- [ ] On a Lightning-side page (`<org>.lightning.force.com/lightning/...`):
      - [ ] Click the toolkit's **Flows** tab. URL navigated to is
            `https://<org>.my.salesforce-setup.com/lightning/setup/Flows/home` —
            with `.my.salesforce-setup.com`, no extra segment between `<org>`
            and `.my.`. Page loads.
      - [ ] Click the toolkit's **Process Automation Settings** tab.
            URL is `https://<org>.my.salesforce-setup.com/lightning/setup/WorkflowSettings/home`.
            Page loads.

- [ ] If you have access to a **dev-edition org** (`<org>-dev-ed.my.salesforce-setup.com`)
      or a **sandbox** with a non-`.my.` Lightning hostname pattern, repeat
      the four checks above on that org. This is the case the v1.2.2
      reporter was hitting; pre-fix code produces a hostname like
      `<org>-dev-ed.my.lightning.force.com` which doesn't exist in DNS.
      Post-fix code produces `<org>-dev-ed.lightning.force.com` which does.

      *(If you don't have such an org handy, this is acceptable to mark
      "n/a" — the v1.2.3 production validation by the external reporter
      is sufficient evidence that the fix works on this org pattern.)*

- [ ] No console warnings or errors during any of the above tab clicks.

---

## Section C — Regression sweep

For each item, the test is "does this still work the way it did in
v1.2.3 (or v2.0.0 as authored, if it changed there)?".

### C1. Side button menu
- [ ] Side button appears on Flow Builder, Flow list view, and Setup
      pages where it appeared in v1.2.3.
- [ ] All previously-listed features still appear in the menu, plus
      the new Scheduled Flow Explorer entry.
- [ ] Clicking each entry opens its modal/feature without console
      errors.

### C2. Health Check (full pass)
- [ ] Runs to completion on a small flow.
- [ ] Runs to completion on a complex flow (the AVF-style one).
- [ ] Findings render in the modal with severities, families, and
      affected items.
- [ ] Markdown summary export looks well-formed (paste into a markdown
      previewer).
- [ ] JSON export is valid JSON.
- [ ] Improvement prompt is non-empty.

### C3. Comparison Exporter
- [ ] Open a Flow comparison view (between two versions of a flow).
- [ ] Trigger the export. Progress toasts ("Loading XLSX library…",
      "Scraping comparison data…", "Generating XLSX…", "Export complete
      — download started.") appear above the export modal.
- [ ] The downloaded `.xlsx` opens and contains the comparison sheet.

### C4. API Name Generator
- [ ] Open the modal. Generate an API name from a label.
- [ ] Generate from an existing API name.
- [ ] Trigger the "Enter a Label first" warning toast — it appears
      above the modal.
- [ ] Toast styling for warning (orange) still correct.

### C5. AI Assistant
- [ ] Opens via the side button.
- [ ] Runs at least one prompt end-to-end.
- [ ] Status toasts (if any) render above the panel.

### C6. Flow Version Manager
- [ ] Opens its modal. Lists versions for the current flow.
- [ ] Its own top-right toast (separate visual style) still works as
      it did in v1.2.3 — that visual is intentionally unchanged in
      v2.0.0 and is queued for consolidation in v2.1.0.

### C7. Flow Trigger Explorer Enhancer
- [ ] On the Flow Trigger Explorer page, rows are enhanced with the
      info-icon tooltip trigger as in v1.2.3.
- [ ] Tooltip displays correctly. Note: this feature still uses the
      v1.2.3-era DOM-only learning approach in v2.0.0 (Tooling API
      batch fetch is queued for v2.1.0).

### C8. Missing Description Flags
- [ ] Toggle on. Refresh. Flagged items appear.
- [ ] Toggle off. Flags disappear.
- [ ] Toasts on enable / disable / refresh appear correctly.

### C9. Setup Tabs / group dropdown
- [ ] Group dropdown opens, contains the expected groups, navigates
      correctly.

### C10. Canvas Search
- [ ] Opens via shortcut/button. Searches across the canvas. Results
      navigate correctly.

### C11. Flow List Search
- [ ] On the Flows list page, the enhanced search behaves as before.

### C12. Settings page
- [ ] Open the options page from `chrome://extensions` → Details →
      Extension options.
- [ ] All existing settings load with their saved values.
- [ ] The Scheduled Flow Explorer settings (if any) appear and save
      correctly.
- [ ] Toggling a feature off in settings results in that feature being
      hidden/disabled on next page load (where applicable in v2.0.0;
      full enable-state respect across all features lands in v2.1.0).

### C13. Console hygiene
- [ ] Open DevTools console while exercising the features above.
      No new uncaught errors compared to v1.2.3 baseline.
      `[SFUT]` info logs are expected; uncaught exceptions are not.

---

## Section D — Smoke test on a clean / second org

If you have a sandbox or second org handy, do a quick pass:

- [ ] Install the extension fresh.
- [ ] Side button appears.
- [ ] Health Check runs on at least one flow.
- [ ] Scheduled Flow Explorer opens and lists flows.
- [ ] No errors on first load.

This catches anything that depends on cached storage from a prior
install.

---

## Sign-off checklist

Before promoting v2.0.0 to release:

- [ ] Section A passes end-to-end on the primary test org.
- [ ] Section B all five items pass (forward-ports verified intact).
- [ ] Section C: every feature you actively rely on passes; any
      partial issues are noted and triaged.
- [ ] Section D smoke test passes on at least one clean org.
- [ ] Console is free of new uncaught errors compared to v1.2.3.
- [ ] `manifest.json` reads `2.0.0`.
- [ ] `CHANGELOG-v2.0.0.md` is present in the package.

If anything in Section B fails, **do not ship** — the forward-port has
slipped and we need to rebuild before release.
