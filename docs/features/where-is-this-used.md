---
layout: default
title: Where Is This Used? | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Where Is This Used?

## Overview

**Where Is This Used?** adds a button to the Salesforce Flow details page that scans the org for any references to the current Flow. Results are displayed in a modal showing where the Flow is used, what type of reference it is, and where in the org that reference lives.

## Where it appears

The **Where Is This Used?** button is injected into the button bar on the **Flow details page** in Salesforce Setup.

## What the feature does

1. Adds a **Where Is This Used?** button to the Flow details page button bar.
2. On click, resolves the API name of the current Flow.
3. Scans active Flows, Quick Actions, Lightning Pages, LWC Components, and Buttons and Links for references to the current Flow.
4. Displays a progress bar during the scan.
5. Renders results in a modal table showing the name, type, reference type, and location of each match.
6. Provides a **Download CSV** button to export results.

## Reference types detected

| Source | Reference types |
|--------|----------------|
| Flows | Subflow, Screen Action, Action Button, Flow Action |
| Quick Actions | Quick Action |
| Lightning Pages | Lightning Page |
| LWC Components | LWC Component |
| Buttons & Links | Detail Button, List Button, Button / Link |

## Results modal

Each result row shows:

- **Name** — the name of the referencing item, linked to the relevant Setup page
- **Type** — the type of the referencing item (e.g. Screen Flow, App Page, Quick Action)
- **Referenced As** — a badge showing how the Flow is referenced (e.g. Subflow, Screen Action)
- **Location** — the object, page, or context where the reference lives

If the Flow is not referenced anywhere, the modal displays a confirmation message.

## CSV export

When results are found, a **Download CSV** button appears in the modal footer. The exported file includes all columns from the results table and is named using the Flow label and the current date.

## How to use it

1. Navigate to a Flow's details page in Salesforce Setup.
2. Click the **Where Is This Used?** button in the page button bar.
3. Wait for the scan to complete — a progress bar tracks the scan across each source type.
4. Review the results in the modal.
5. Optionally click **Download CSV** to export the results.

## Notes and limitations

- The scan covers active Flows only. Inactive Flows that reference the current Flow will not appear in results.
- LWC Components are scanned for static `flow-api-name` attribute references. Dynamic bindings using a property (e.g. `flow-api-name={myProp}`) cannot be detected statically.
- The scan time varies depending on the number of Flows, Lightning Pages, and LWC Components in the org. Large orgs may take longer.
- The feature uses the Salesforce Tooling API and requires the current user to have access to query the relevant metadata types.