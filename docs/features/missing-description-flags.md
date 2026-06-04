---
layout: default
title: Missing Description Flags | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Missing Description Flags

## Overview

**Missing Description Flags** helps identify Flow elements and resources that do not currently have descriptions by adding visible warning indicators in Salesforce Flow Builder.

Current behaviour supports flagging missing descriptions across:

- Flow canvas elements
- toolbox items and resources
- flow-level description state
- some orchestration-related items such as steps

## Where it appears

Missing Description Flags is intended for **Salesforce Flow Builder**, with indicators placed on canvas element cards, left-panel toolbox/resource items, and the Flow header area.

## What the feature does

1. Checks whether the feature is enabled in settings.
2. Waits until the current Flow ID is available.
3. Retrieves Flow metadata.
4. Identifies elements and resources that have no description.
5. Starts observing the DOM for relevant builder changes.
6. Injects warning flags onto matching canvas elements, toolbox/resource items, and at Flow level if the Flow itself has no description.
7. Supports a manual refresh action to re-fetch metadata and rebuild flags.
8. Optionally refreshes after Save when save completion is detected.

## What gets flagged

Canvas elements (Action, Assignment, Decision, Loop, Get/Create/Update/Delete Records, Screen, Subflow, Transform, Wait, and more), resources (Variable, Formula, Constant, Text Template, Choice, Dynamic Choice Set), the Flow-level description, and orchestration items (Stage, Step).

![Missing Description Flags Flagged Items](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/missing-description-flags/missing-description-flags-flagged-items.png)

## Activation and refresh behaviour

The feature can be toggled between **Show Missing Description Flags** and **Hide Missing Description Flags** from the side button menu. A manual refresh action re-fetches metadata and rebuilds flags — useful after adding descriptions without reloading the page.

![Missing Description Flags Hide/Show/Refresh Side Bar Items](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/missing-description-flags/missing-description-flags-hide-refresh-side-bar-items.png)

The feature can also be fully enabled or disabled from the Settings page.

![Missing Description Flags Settings Toggle](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/missing-description-flags/missing-description-flags-settings-toggle.png)

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Enable **Missing Description Flags** from the extension (enabled by default).
3. Review the warning indicators shown on the canvas, in the toolbox, and at Flow level.
4. Add missing descriptions as needed.
5. Use the refresh action to rebuild flags after updates.

## Notes and limitations

- The feature depends on Salesforce Flow Builder DOM structure and selectors remaining compatible.
- Some items may render later than others — the feature includes retry behaviour and DOM observation to catch late-rendering content.
- Manual refresh is the most reliable way to keep flags in sync after editing descriptions.
