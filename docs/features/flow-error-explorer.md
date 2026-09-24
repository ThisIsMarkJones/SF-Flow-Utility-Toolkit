---
layout: default
title: Flow Error Explorer | SF Flow Utility Toolkit
meta-description: Translate Salesforce Flow runtime errors into plain English with causes, remediation steps, and AI-ready prompts.
---

# Flow Error Explorer

## Overview

**Flow Error Explorer** is a two-part feature that helps Salesforce administrators and developers understand, diagnose, and resolve runtime errors in Salesforce Flows.

The first part activates automatically when Flow Builder is opened via a fault debug link. It detects the error state in the debug panel, injects an **Explore Error** button into the debug toolbar, and opens a structured error analysis modal that translates the raw Salesforce fault string into plain English with actionable remediation guidance.

The second part provides standalone access to the **Error Dictionary** from Salesforce Setup, allowing developers to look up any known Flow error code proactively — without needing an active error session.

## Where it appears

**Flow Error Explorer** — activates in **Salesforce Flow Builder** when the page is opened via a fault debug link (a URL containing a `guid` parameter). The **Explore Error** button is injected into the debug panel toolbar. The feature is also accessible from the toolkit side button menu when an error context has been detected.

**Error Dictionary** — accessible from the toolkit side button on Salesforce Setup pages at any time, regardless of whether a debug session is active.

## What the feature does

### Flow Error Explorer (debug sessions)

1. Detects whether the current Flow Builder session was opened via a fault debug link by checking for a `guid` parameter in the URL.
2. Observes the debug panel DOM for the error state to finish rendering.
3. Extracts the structured error context from the debug panel, including the raw fault string, faulted element type and label, and any record IDs mentioned in the fault message.
4. Translates the raw fault string using the Error Translator, which identifies the Salesforce ExceptionCode, strips boilerplate text, extracts record IDs, and detects cascade failures.
5. Matches the ExceptionCode against the Error Dictionary to retrieve a plain-English description, common causes, and recommended remediations.
6. Injects an **Explore Error** button into the debug panel toolbar.
7. Refreshes the toolkit side button menu to surface the **Explore Error** menu item.
8. On activation, retrieves the Flow metadata via the Salesforce Tooling API and resolves the faulted element's API name where possible.
9. Opens the error analysis modal with the fully enriched error context.

### Error Dictionary (Setup pages)

Opens the Error Dictionary modal in standalone mode, providing access to the full reference catalogue of known Salesforce Flow error codes without requiring an active debug session.

## Error analysis modal

The modal presents a structured breakdown of the detected error:

### Error summary

- **Error code** — the Salesforce ExceptionCode extracted from the fault string
- **Error category** — the category from the Error Dictionary (e.g. Validation, Governor Limits, Data Operations)
- **Severity** — High, Medium, or Low
- **Human-readable message** — the fault string cleaned of Salesforce boilerplate text
- **Cascade indicator** — flags if the error appears to be a secondary failure caused by another flow or action
- **Affected record IDs** — any Salesforce record IDs extracted from the fault message
- **Faulted element** — the element type and label where the fault occurred

### Dictionary entry

The modal displays the matching Error Dictionary entry for the detected error code, including:

- A plain-English description of what the error means
- Common causes in a Flow context
- Actionable remediation recommendations
- Related error codes to be aware of

### AI prompt

The modal provides a **Copy AI Prompt** action that assembles a structured prompt including the flow label, faulted element, error code, error message, and raw fault string. The prompt requests a plain-English explanation, step-by-step remediation instructions, fault path guidance, and relevant best practice recommendations. The prompt can be pasted directly into any AI tool.

### Error Dictionary tab

The modal includes an **Error Dictionary** tab listing the full catalogue of known error codes, grouped by category, so developers can browse related errors while diagnosing the current one.

## Error Dictionary

The Error Dictionary covers the following categories and error codes:

| Category | Error Codes |
|----------|-------------|
| Validation | FIELD_CUSTOM_VALIDATION_EXCEPTION, REQUIRED_FIELD_MISSING, FIELD_INTEGRITY_EXCEPTION |
| Governor Limits | APEX_CPU_TIME_LIMIT_EXCEEDED, TOO_MANY_SOQL_QUERIES, TOO_MANY_DML_ROWS, TOO_MANY_DML_STATEMENTS |
| Data Operations | CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY, ENTITY_IS_DELETED |
| Access & Permissions | INSUFFICIENT_ACCESS_OR_READONLY, INSUFFICIENT_ACCESS, INVALID_SESSION_ID |
| Apex & Actions | INVALID_FIELD, INVALID_TYPE |
| Duplicate Rules | DUPLICATES_DETECTED |
| Cascade Failures | Detected via pattern matching against cascade language in the fault string |
| Unknown | Catch-all fallback for unrecognised error codes |

Each entry in the dictionary includes a description, causes, recommendations, a fault string example, and related error codes.

## How to use it

### Exploring a runtime error

1. When a Flow fails at runtime, open the fault debug link from the failed Flow interview or email notification.
2. Flow Builder opens in debug mode. The toolkit detects the error and injects the **Explore Error** button into the debug panel toolbar.
3. Click **Explore Error** in the toolbar, or select it from the toolkit side button menu.
4. The error analysis modal opens, displaying the translated error, dictionary entry, and AI prompt.
5. Review the causes and recommendations to identify the remediation path.
6. Use **Copy AI Prompt** to copy a ready-made prompt to your clipboard for use in an AI tool.

### Accessing the Error Dictionary proactively

1. Navigate to any Salesforce Setup page.
2. Open the toolkit side button.
3. Select **Error Dictionary** from the menu.
4. Browse the full catalogue of known Flow error codes by category.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Flow Error Explorer enabled | On | Enables or disables both the Flow Error Explorer and Error Dictionary features |

## Notes and limitations

- The Flow Error Explorer only activates when Flow Builder is opened via a fault debug link containing a `guid` URL parameter. It does not activate on standard Flow Builder sessions.
- The error context is extracted from the debug panel DOM. If the debug panel has not fully rendered when the feature is activated, the feature will attempt a fresh extraction.
- Record ID extraction from fault strings is pattern-based and covers standard 15 and 18 character Salesforce IDs.
- Element API name resolution is a best-effort lookup based on matching the faulted element label against the Flow metadata. Label collisions in edge cases may result in an unresolved API name.
- Cascade failure detection is based on language patterns in the fault string and may not identify all cascade scenarios.
- The Error Dictionary covers known Salesforce Flow exception codes. Error codes not in the dictionary are handled by a generic catch-all entry.