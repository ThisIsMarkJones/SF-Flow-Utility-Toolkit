---
layout: default
title: Flow List Search
---

# Flow List Search

## Overview

**Flow List Search** enhances the Salesforce **Setup Flows** page by adding a search and filtering toolbar above the Flow list.

The feature is designed to make it easier to find specific Flows in larger orgs by allowing users to:

- search by Flow label
- search by Flow API name
- filter by Flow status
- filter by Flow type
- quickly see how many Flows match the current filters

![Flow List Search Module]({{ '/images/flow-list-search/flow-list-search-module.png' | relative_url }})

## Where it appears

Flow List Search is intended for the Salesforce **Setup Flows** page:

`https://{org}.salesforce-setup.com/lightning/setup/Flows/home`

The feature waits for the Flow list view table to load, then injects its toolbar into the page header area or list view container.

## What the feature does

Flow List Search currently provides the following functionality:

1. Waits for the Salesforce Flow list to render.
2. Injects a search input above the list.
3. Injects **Status** and **Type** filter dropdowns.
4. On first interaction, automatically scrolls the list to force Salesforce to load all lazily rendered rows.
5. Indexes the available Flow rows for searching and filtering.
6. Searches using Flow label and Flow API name.
7. Filters results by status and Flow type.
8. Displays a count showing matching Flows versus the total indexed Flows.

## Search behaviour

The search input is designed to help locate Flows quickly using text-based matching.

Current behaviour includes:

- search by **Flow label**
- search by **Flow API name**
- search works against a combined search index built from key row values
- matching is case-insensitive
- the search input uses a small debounce before applying results

The placeholder text shown in the search box is:

**Search by label or API name...**

![Flow List Search Results]({{ '/images/flow-list-search/flow-list-search-results.png' | relative_url }})

## Filters

### Status filter

The Status filter currently supports:

- All Statuses
- Active
- Inactive

Status values are normalized internally so both checkbox-style values and textual active/inactive values can be handled consistently.

![Flow List Search Status Filter]({{ '/images/flow-list-search/flow-list-search-status-filter.png' | relative_url }})

### Type filter

The Type filter is populated dynamically from the Flows currently indexed in the list.

This means the available options are based on the Flow rows detected on the page after the full list has been loaded.

Type labels are mapped into more user-friendly display values where possible. Examples include:

- Screen Flow
- Autolaunched Flow
- Scheduled Flow
- Record-Triggered Flow (Before Save)
- Record-Triggered Flow (After Save)
- Platform Event-Triggered Flow

If a type value is not in the defined label map, it is converted into a more human-readable format.

![Flow List Search Flow Type Filter]({{ '/images/flow-list-search/flow-list-search-flow-type-filter.png' | relative_url }})

## Lazy-loading support

Salesforce can lazily render additional Flow rows as the user scrolls the list.

To improve search accuracy, Flow List Search attempts to load all rows before applying full indexing and filtering. On first focus, input, or filter interaction, the feature automatically scrolls the Flow list container to the bottom and waits for row counts to stabilise before returning to the top.

This is intended to ensure that search and filtering work across the full visible list rather than only the rows initially rendered.

## Count and clear behaviour

The toolbar shows a count label to help the user understand the current result set.

Depending on state, the count can show values such as:

- total number of Flows
- visible number of matching Flows
- no matching Flows
- loading all Flows

The toolbar also includes a **Clear** button, which:

- clears the search term
- resets the Status filter
- resets the Type filter
- reapplies the unfiltered list view
- returns focus to the search box

## Keyboard shortcut

Flow List Search currently supports a keyboard shortcut to focus the search box:

- **Ctrl + Shift + F**
- **Cmd + Shift + F** on macOS

When triggered, the search input is focused and its contents are selected.

## How to use it

1. Open the Salesforce **Setup Flows** page.
2. Wait for the Flow list to load.
3. Use the search box to enter part of a Flow label or API name.
4. Optionally apply a Status filter.
5. Optionally apply a Type filter.
6. Review the filtered list and count label.
7. Use **Clear** to reset the toolbar state.

## Notes and limitations

Current implementation notes:

- The feature is designed specifically for the Salesforce **Setup Flows** page.
- It depends on Salesforce list view DOM patterns and selectors being present.
- Type options are generated dynamically from the currently indexed rows.
- Search accuracy improves once lazy-loaded rows have been fully loaded.
- If the expected list view table cannot be found, the feature does not activate.
- Changes to Salesforce DOM structure may require future selector updates.

## Accessibility and usability notes

The current implementation includes:

- labelled search input
- labelled filter dropdowns
- a clear button with an accessible label
- keyboard shortcut support for quick access
