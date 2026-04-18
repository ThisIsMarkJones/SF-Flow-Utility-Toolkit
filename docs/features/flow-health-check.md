---
layout: default
title: Flow Health Check
---

# Flow Health Check

## Overview

**Flow Health Check** analyses the currently open Salesforce Flow and produces a structured health report intended to help identify maintainability, reliability, performance, and portability concerns.

The feature inspects the current Flow metadata, evaluates it against a defined set of health rules, groups findings into issue families, calculates an overall score, and presents the results in a dedicated modal. It also provides export options for summary sharing and follow-on improvement work.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Health Check modal open with a completed report.<br>
Suggested file: <code>/images/flow-health-check/health-check-modal-overview.png</code>
</div>

## What the feature does

Flow Health Check currently performs the following high-level steps:

1. Determines the current Flow from the Salesforce URL.
2. Retrieves the Flow metadata.
3. Normalizes the Flow metadata into a stable internal structure.
4. Evaluates the Flow against a set of health rules.
5. Groups findings into issue families.
6. Calculates an overall score and rating.
7. Builds supporting summary data, including dependency information.
8. Displays the report in a modal with export and copy actions.

## Where it appears

Flow Health Check runs against the **currently open Flow** in Salesforce Flow Builder.

The report is presented in a modal overlay titled **Flow Health Check**.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing where the user launches Flow Health Check from within the extension UI.<br>
Suggested file: <code>/images/flow-health-check/health-check-launch-entry-point.png</code>
</div>

## Report contents

### Header summary

The header displays:

- Flow label
- Flow type
- API version
- Flow status
- Overall score
- Rating

### Severity summary cards

The report includes summary cards for:

- High
- Medium
- Low
- Info

### Issue Families

Each issue family can be expanded to show:

- severity
- title
- instance count
- score impact
- affected items

### Flow Profile

The Flow Profile section currently includes metrics such as:

- Elements
- Decisions
- Loops
- Data Operations
- Dependencies

### Dependencies

The report lists detected custom dependencies, including where applicable:

- Apex Actions
- Subflows
- LWC components
- Apex-defined types
- External actions

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Issue Families section expanded.<br>
Suggested file: <code>/images/flow-health-check/health-check-issue-families.png</code>
</div>

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Flow Profile and Dependencies sections.<br>
Suggested file: <code>/images/flow-health-check/health-check-profile-and-dependencies.png</code>
</div>

## Scoring model

The current scoring model starts from **100** and deducts score once per issue family based on the worst severity in that family.

Current score weights are:

- High = -5
- Medium = -3
- Low = -1
- Info = 0

Current score rating bands are:

- 90 or above = Excellent
- 80 to 89 = Very Good
- 70 to 79 = Good
- 55 to 69 = Poor
- below 55 = Very Poor

## Checks currently included

### Maintainability checks

- Missing Flow description
- Missing element descriptions
- Missing resource descriptions
- Generic element naming
- Naming convention mismatches for Flow, variables, formulas, and constants

### Reliability checks

- Missing fault paths
- Broad or missing entry criteria for record-triggered Flows
- Trigger timing mismatch

### Performance checks

- DML inside loops
- Get Records inside loops
- Nested loops
- High data operation count

### Portability checks

- Outdated API version
- Possible hard-coded Salesforce IDs
- Possible hard-coded URLs
- Custom dependency inventory

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Launch **Flow Health Check** from the extension.
3. Wait while the Flow metadata is analysed.
4. Review the report in the modal.
5. Expand issue families to inspect affected items.
6. Use one of the available export actions if needed.

## Export and follow-on actions

The current modal footer supports the following actions:

- **Copy Summary** — Copies a markdown summary of the Health Check report.
- **Copy JSON** — Copies the raw JSON report.
- **Send to Improvement Prompt** — Copies a generated improvement prompt to the clipboard and, if available, activates the AI Assistant.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the modal footer actions.<br>
Suggested file: <code>/images/flow-health-check/health-check-export-actions.png</code>
</div>

## Error handling

If the current Flow ID cannot be determined from the URL, or if Flow metadata cannot be retrieved, the feature displays an error state in the modal.

If an unexpected error occurs during execution, the modal displays the error message where available.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the error state of the Health Check modal.<br>
Suggested file: <code>/images/flow-health-check/health-check-error-state.png</code>
</div>

## Notes and limitations

- The Health Check runs against the currently open Flow.
- The report is based on retrieved Flow metadata and the current rule set.
- Some findings are heuristic in nature, especially possible hard-coded ID and URL detection.
- Dependency reporting is intended as an inventory aid and does not by itself confirm deployment readiness.
- Naming convention checks depend on available settings and prefix configuration.
- If naming configuration cannot be fully built, the Health Check falls back to default behaviour.

<div class="note-box">
This page is intended as a first documentation prototype and can be expanded later with issue family reference pages, export examples, and troubleshooting guidance.
</div>
