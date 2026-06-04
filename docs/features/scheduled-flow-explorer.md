---
layout: default
title: Scheduled Flow Explorer | SF Flow Utility Toolkit
---

# Scheduled Flow Explorer

## Overview

**Scheduled Flow Explorer** surfaces all active Schedule-Triggered Flows in your org and shows when each one is next scheduled to run. It provides two complementary views — a searchable List View and a Calendar View — so you can quickly understand your organisation's scheduled automation footprint without navigating to each flow individually.

## Where it appears

Scheduled Flow Explorer is accessible from the toolkit side button menu when you are on the **Salesforce Setup Flows page**.

## What the feature does

When opened, the explorer:

1. Discovers all active Schedule-Triggered Flows in the org via the Tooling API.
2. Reads each flow's schedule definition (frequency, start time, object, batch size).
3. Calculates the next scheduled run time relative to the current date and time.
4. Detects the org's configured timezone and displays all times accordingly.
5. Presents the results in the selected view (List or Calendar).

Discovery runs in the background with a progress indicator while the modal is open. Results are cached for the session; a **Refresh** button re-triggers discovery.

## Views

### List View

The List View shows all discovered flows in a sortable, filterable table. Each row displays:

- **Flow name** and description (where available)
- **Frequency** — the schedule cadence (e.g. Daily, Weekly, Once)
- **Object** — the Salesforce object the flow runs against (where applicable)
- **Next Run** — the calculated next scheduled run time in the org's timezone

You can:

- Search by flow name using the search field
- Filter rows by frequency using the frequency pills (All, Once, Daily, Weekly)
- Sort by any column by clicking the column header
- Click a row to open a detail panel for that flow

#### Detail panel

Clicking a row opens a detail modal showing:

- Flow name, description, status, and API version
- Full schedule definition (frequency, start date/time, object, batch size)
- A list of upcoming scheduled run times

### Calendar View

The Calendar View renders a monthly calendar with scheduled run events plotted on their run dates. Use the previous/next controls to move between months.

Days with scheduled runs show a summary indicator. Clicking **+ N more** on a day opens a day modal listing all flows scheduled on that date.

## Settings

<table>
  <thead>
    <tr>
      <th>Setting</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Enable Scheduled Flow Explorer</strong></td>
      <td>Master toggle. When off, the feature does not appear in the side button menu.</td>
    </tr>
    <tr>
      <td><strong>Default View</strong></td>
      <td>Sets whether the modal opens on List View or Calendar View.</td>
    </tr>
  </tbody>
</table>

Settings are accessible from the extension's Settings page under **Scheduled Flow Explorer**.

## Notes and limitations

- Discovery requires access to the Salesforce Tooling API. If the API is unavailable or returns an error, an error banner is shown inside the explorer.
- Next-run time calculations are performed client-side based on the schedule definition. For flows with complex or unusual schedules, verify against the flow's own configuration.
- Only **active** Schedule-Triggered Flows are shown. Inactive and draft flows are excluded.
- The org timezone is fetched from the Salesforce API on each open. If the timezone cannot be determined, UTC is used as a fallback.
- Flows with missing or incomplete schedule metadata may appear with partial information.