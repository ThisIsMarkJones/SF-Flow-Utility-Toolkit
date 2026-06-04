---
layout: default
title: Flow Trigger Explorer Enhancer | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Flow Trigger Explorer Enhancer

## Overview

**Flow Trigger Explorer Enhancer** is a beta feature that adds lightweight enrichments to Salesforce **Flow Trigger Explorer** rows, surfacing useful metadata directly in the list view without requiring users to repeatedly open the right-hand details panel.

Current enrichments include:

- an inline info icon next to the Flow label
- inline version and API metadata
- coloured trigger-context tags
- a compact metadata tooltip

## Where it appears

Flow Trigger Explorer Enhancer is intended for **Salesforce Flow Trigger Explorer**.

## What the feature does

1. Detects that the user is in Flow Trigger Explorer.
2. Scans visible Flow rows in the explorer.
3. Adds an inline info icon, inline metadata (version, API version), and coloured context tags (Created, Updated, Deleted).
4. Learns richer metadata from the right-hand Flow Details panel when available.
5. Caches learned metadata locally.
6. Re-renders enriched rows when better metadata becomes available.
7. Watches for DOM changes and refreshes enhancements as the explorer updates.

![Flow Trigger Explorer Enhancer Injected Information](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/flow-trigger-explorer-enhancer/flow-trigger-explorer-enhancer-injected-information.png)

## Tooltip content

The tooltip currently shows (when available): Last Modified By, Trigger Order, Process Type, Trigger.

![Flow Trigger Explorer Enhancer Tooltip Information](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/flow-trigger-explorer-enhancer/flow-trigger-explorer-enhancer-tooltip-information.png)

## How metadata is learned

The feature uses a DOM-first approach and does not make API calls. It combines data from the explorer rows themselves with richer data from the right-hand details panel. Learned metadata is stored in local storage and reused to improve future row rendering.

## How to use it

1. Open Salesforce **Flow Trigger Explorer**.
2. Allow the enhancer to initialise.
3. Review the explorer rows for added metadata and context tags.
4. Hover over or focus the info icon to view the compact tooltip.
5. Open a Flow Details panel where needed to allow richer metadata to be learned.

## Notes and limitations

- This feature is explicitly described as **beta**.
- It uses a DOM-first approach and does not make API calls.
- Context tags are limited to the current explorer context only and are not persisted across views.
- Richer row metadata depends on what is currently available in the right-hand details panel.
