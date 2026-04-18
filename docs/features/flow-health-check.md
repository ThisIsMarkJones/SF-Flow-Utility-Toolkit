# Flow Health Check

## Overview

**Flow Health Check** analyses the currently open Salesforce Flow and produces a structured health report intended to help identify maintainability, reliability, performance, and portability concerns.

The feature inspects the current Flow's metadata, evaluates it against a defined set of health rules, groups findings into issue families, calculates an overall score, and presents the results in a dedicated modal. It also provides export options for summary sharing and follow-on improvement work.

> **Screenshot placeholder:** Add a screenshot here showing the Health Check modal open with a completed report.
>
> Suggested file:
> `../images/flow-health-check/health-check-modal-overview.png`

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

> **Screenshot placeholder:** Add a screenshot here showing where the user launches Flow Health Check from within the extension UI.
>
> Suggested file:
> `../images/flow-health-check/health-check-launch-entry-point.png`

## Report contents

The Health Check report currently includes the following sections.

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

These reflect the number of issue families at each severity level.

### Issue Families

Findings are grouped into **issue families**, rather than treated only as isolated individual issues.

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

> **Screenshot placeholder:** Add a screenshot here showing the Issue Families section expanded.
>
> Suggested file:
> `../images/flow-health-check/health-check-issue-families.png`

> **Screenshot placeholder:** Add a screenshot here showing the Flow Profile and Dependencies sections.
>
> Suggested file:
> `../images/flow-health-check/health-check-profile-and-dependencies.png`

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

This means the score is intended to represent the overall health of the Flow at a family level, rather than heavily penalising repeated instances of the same issue type.

## Checks currently included

The current implementation evaluates a range of health checks across several categories.

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

These checks are currently produced by the rule engine and then grouped into score families for reporting.

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Launch **Flow Health Check** from the extension.
3. Wait while the Flow metadata is analysed.
4. Review the report in the modal.
5. Expand issue families to inspect affected items.
6. Use one of the available export actions if needed.

## Export and follow-on actions

The current modal footer supports the following actions:

- **Copy Summary**  
  Copies a markdown summary of the Health Check report.

- **Copy JSON**  
  Copies the raw JSON report.

- **Send to Improvement Prompt**  
  Copies a generated improvement prompt to the clipboard and, if available, activates the AI Assistant.

The markdown summary includes Flow details, score, severity counts, key issue families, and dependency counts.

The improvement prompt includes the Flow summary, issue families, dependencies, and a request to prioritise the most important changes first.

> **Screenshot placeholder:** Add a screenshot here showing the modal footer actions.
>
> Suggested file:
> `../images/flow-health-check/health-check-export-actions.png`

## How findings are interpreted

Flow Health Check is intended to provide a practical quality review, not a hard validator.

A lower score does not automatically mean that a Flow is incorrect, and a higher score does not guarantee that a Flow is fully optimised. Instead, the feature is designed to highlight patterns that are commonly associated with:

- harder maintenance
- weaker fault handling
- avoidable performance risk
- deployment or environment portability concerns

Users should review findings in the context of the Flow's actual business purpose.

## Naming convention support

Where available, Flow Health Check can use naming settings and configured prefixes from the extension to evaluate naming convention compliance for:

- Flow API names
- variables
- formulas
- constants

This allows the Health Check to align with the naming approach already used elsewhere in the toolkit, rather than relying only on fixed hardcoded patterns.

## Error handling

If the current Flow ID cannot be determined from the URL, or if Flow metadata cannot be retrieved, the feature displays an error state in the modal.

If an unexpected error occurs during execution, the modal displays the error message where available.

> **Screenshot placeholder:** Add a screenshot here showing the error state of the Health Check modal.
>
> Suggested file:
> `../images/flow-health-check/health-check-error-state.png`

## Notes and limitations

Current implementation notes:

- The Health Check runs against the currently open Flow.
- The report is based on retrieved Flow metadata and the current rule set.
- Some findings are heuristic in nature, especially possible hard-coded ID and URL detection.
- Dependency reporting is intended as an inventory aid and does not by itself confirm deployment readiness.
- Naming convention checks depend on available settings and prefix configuration.
- If naming configuration cannot be fully built, the Health Check falls back to default behaviour.

## Future documentation expansion

This page can later be expanded with more detailed sections such as:

- score interpretation guidance
- issue family reference
- examples of strong vs weak Flow patterns
- export format examples
- AI Assistant handoff examples
- troubleshooting for unsupported or unexpected Flow structures
