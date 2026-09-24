---
layout: default
title: Import / Export Flows | SF Flow Utility Toolkit
meta-description: Export a Flow as a .flow-meta.xml file and import one back into the org as a new version, without SFDX.
---

# Import / Export Flows

## Overview

**Import / Export Flows** moves Flow metadata in and out of a Salesforce org from the browser, without SFDX, the Metadata API SOAP endpoints, or a local development environment.

**Export** downloads the Flow currently open in Flow Builder as a `.flow-meta.xml` file — the same source format produced by a Metadata API retrieve — so it can be committed to version control, attached to a ticket, reviewed offline, or handed to another org.

**Import** takes a `.flow-meta.xml` file and deploys it into the current org as a **new version** of that Flow. Before anything is created, the file is validated, checked against the versions already in the org, and compared against a target version so you can see exactly what will change. An import that would produce an identical duplicate version is blocked outright, and every import lands as an inactive draft unless you explicitly choose to activate it.

Both halves live in a single panel so that exporting from one org and importing into another is one continuous workflow.

## Where it appears

The feature is opened from the toolkit side button menu item **📦 Import / Export Flows** in two contexts:

- **Salesforce Flow Builder** — the panel opens with the **Export** tab only. Flow Builder already has a flow open on the canvas, which makes importing a second flow an invalid context, so the Import tab is hidden here.
- **Setup Flows list page** — the panel opens on the **Import** tab, since there is no single open flow to export from the list page.

The panel is the only entry point. It is dismissed with the close button, the footer **Close** button, a click on the backdrop, or the `Esc` key.

## Export

### What the feature does

1. Reads the Flow version ID from the current Flow Builder URL.
2. Retrieves the Flow record and its `Metadata` payload through the Salesforce Tooling API.
3. Converts the Tooling API `Metadata` JSON into a Metadata API `.flow-meta.xml` document — object keys become elements, arrays become repeated sibling elements, `null` and `undefined` values are omitted, and text content is XML-escaped.
4. Wraps the result in the standard `<Flow xmlns="http://soap.sforce.com/2006/04/metadata">` root with an XML declaration, indented with four spaces to match Salesforce source-format output.
5. Derives the file name from the Flow's `DeveloperName` and downloads it as `<DeveloperName>.flow-meta.xml`.

Progress and failures are reported through toast messages, and the export button is disabled while a retrieve is in flight.

### Multi-flow export

Selecting several flows from the Setup Flows list and exporting them together as a ZIP is not available in this release. Opening the **Export** tab from the Setup Flows list page shows a placeholder noting that multi-flow export is coming in a later release. Single-flow export from Flow Builder is fully available.

## Import

### What the feature does

The Import tab is a guided wizard. Each step has to pass before the next one is offered.

1. **Pick a file** — choose a `.flow-meta.xml` file through the file picker, or drag and drop it onto the panel.
2. **Validate the file name** — the name must match `<DeveloperName>.flow-meta.xml`, where the developer name starts with a letter and contains only letters, numbers, and underscores. The captured developer name becomes the `package.xml` member and the deploy path, so a name Salesforce would reject is caught before any request is made.
3. **Validate the contents** — the file is parsed as XML and its root element must be `<Flow>`. The top-level `<status>` value is read at the same time, and determines whether the activate option is offered later.
4. **Check the org** — the org is queried for existing versions of that Flow, newest first.
5. **Resolve a compare target** — see [Compare target resolution](#compare-target-resolution) below.
6. **Diff against the target** — the imported file is compared against the target version. An identical file is a hard block.
7. **Confirm** — a summary of what will be created, with the change list and the activate option.
8. **Deploy** — a Metadata API deploy package is assembled and deployed, with live status until it finishes.

### Compare target resolution

The target version the import is checked against is resolved automatically where the answer is unambiguous:

- **No existing versions** — the flow is new to the org. No diff is possible, and the wizard moves straight to confirmation, noting that a new Flow will be created as **Version 1**.
- **An active version, and no higher-numbered inactive version** — the active version is used as the compare target.
- **No active version** — the highest-numbered version is used.
- **An active version *and* a higher-numbered inactive version** — you are asked which to compare against, since either answer is legitimate. The choice is between the active version and the latest inactive version, and the active version is preselected.

In all cases the new version number is the highest existing version number plus one.

### Diff engine

The diff compares the imported file against the target version's metadata rendered back into the same XML form, so the comparison is text against text and free of XML-versus-JSON type ambiguity.

Both documents pass through an identical canonicalisation pipeline before comparison. The following are treated as noise and ignored:

| Ignored | Reason |
|---------|--------|
| `locationX` / `locationY` | Canvas position only — cosmetic, no behavioural difference |
| Top-level `<status>` | Deliberately overridden on import, so it is never a real difference |
| `processMetadataValues` | Builder-internal values such as `BuilderType` and `CanvasMode`, which differ across builder versions and carry no flow logic |
| Sibling element order | Repeated sibling elements are compared as an unordered multiset, so a reordered array is not reported as a change |

Everything else is treated as a genuine difference. Differences are reported as three lists — **Changed**, **Added**, and **Removed** — keyed by element name, with the first twelve entries of each list shown and the remainder summarised as a count.

If canonicalisation produces two identical documents, the import is blocked with a **No differences found** message naming the version it matched. Importing would create an unnecessary duplicate version, so there is no override for this.

### Inactive by default

Imports are conservative by design.

The version created by an import is always imported as an **inactive draft**, unless you explicitly opt in to activation.

The activate option is only offered when the source file's top-level `<status>` is `Active` — in other words, when the file came from an active version in its source org. Even then, the checkbox is unchecked by default, and the confirmation screen states that the default is to import as an inactive draft. When the source file is not marked active, no activate option appears at all and the confirmation screen says the new version will be imported as an inactive draft.

The `<status>` element in the deployed file is rewritten to `Active` or `Draft` to match the choice made on the confirmation screen, so the source file's own status never silently decides what happens in the target org.

### Deployment

1. The flow XML is rewritten with the chosen `<status>` value.
2. A `package.xml` is generated for the single Flow member against API version 67.0.
3. JSZip is loaded on demand and used to assemble the deploy package — `package.xml` plus `flows/<DeveloperName>.flow`.
4. The package is deployed to the Metadata REST `deployRequest` endpoint with `singlePackage` and `rollbackOnError` enabled, and `checkOnly` disabled.
5. The deploy is polled every two seconds for up to five minutes, with the current Salesforce deploy status shown as it changes.
6. The result screen reports success — naming the flow and whether it was activated or left as a draft — or failure, listing each component failure as `<component>: <problem>`.

Closing the panel during a deploy stops the polling. The deploy itself continues server-side; the outcome can be checked from **Deployment Status** in Setup.

## How to use it

### Exporting a flow

1. Open the flow in Flow Builder.
2. Open the toolkit side button and select **Import / Export Flows**.
3. The panel opens on the **Export** tab.
4. Click **Export Flow**.
5. The flow downloads as `<DeveloperName>.flow-meta.xml`.

### Importing a flow

1. Navigate to the Flows list in Salesforce Setup.
2. Open the toolkit side button and select **Import / Export Flows**.
3. The panel opens on the **Import** tab.
4. Click **Choose File…** and select a `.flow-meta.xml` file, or drag the file onto the panel.
5. Wait while the file is validated and checked against the org.
6. If prompted, choose whether to compare against the active version or the latest inactive version.
7. Review the change list on the confirmation screen.
8. If the source flow was active and you want the new version live, tick the activate option. Otherwise leave it unticked to import as a draft.
9. Click **Create New Version** and wait for the deploy to complete.
10. Refresh the Flow list or Flow Builder to see the new version.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Import / Export Flows enabled | On | Enables or disables the feature and its side button menu item entirely |

## Notes and limitations

- Export is available in Flow Builder only, and exports the single flow currently open on the canvas. There is no export entry point on the Flow list page in this release.
- Multi-flow selection and ZIP export are not available in this release.
- Import is available on the Setup Flows list page only. The Import tab is hidden in Flow Builder, where an already-open flow makes importing another an invalid context.
- Import always creates a **new version**. It never overwrites, replaces, or deletes an existing version.
- Only one flow can be imported at a time, from a single `.flow-meta.xml` file. Importing a ZIP or a whole package is not supported.
- The file name must be `<DeveloperName>.flow-meta.xml`. A renamed file will be rejected, because the name determines the API name the flow is deployed under.
- An import that is functionally identical to its compare target is blocked and cannot be forced through.
- Because `locationX` and `locationY` are ignored by the diff, a file that differs from the target only in canvas layout counts as identical and will be blocked.
- Deploys are subject to all the usual Salesforce validation. A flow referencing objects, fields, Apex classes, or other components that do not exist in the target org will fail at deploy time, and the component failures are listed on the result screen.
- The deploy uses `rollbackOnError`, so a failed deploy leaves the org unchanged.
- Polling stops after five minutes and reports a timeout. A long-running deploy may still complete afterwards — check **Deployment Status** in Setup.
- Activating on import is subject to the same org rules as activating from Flow Builder. A flow that Salesforce will not activate will fail at deploy time rather than import as a draft.
- Deploying metadata requires a user with the relevant metadata deployment permissions in the target org.
