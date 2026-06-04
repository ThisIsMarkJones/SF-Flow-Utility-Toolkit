---
layout: default
title: Canvas Search | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Canvas Search

## Overview

**Canvas Search** adds a search overlay to Salesforce Flow Builder, allowing users to search across the current Flow and move through matches more easily.

The feature helps users work more efficiently in larger or more complex Flows by providing a quick way to locate:

- Flow elements by label
- Flow elements by type
- connector labels such as decision outcomes
- toolbox and resource items in the left panel

Canvas Search highlights matching items and allows users to move between results using either the keyboard or on-screen navigation controls.

![Canvas Search Module](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/canvas-search/flow-canvas-search-module.png)

## Where it appears

Canvas Search is intended for **Salesforce Flow Builder**. It displays a search bar overlay positioned within the canvas area.

## What the feature does

1. Detects that the user is in Flow Builder.
2. Loads the configured shortcut and highlight colour settings.
3. Opens a search overlay on demand.
4. Searches Flow elements by label and type.
5. Searches connector badges, such as labelled decision outcomes.
6. Searches items in the left-hand toolbox panel, including resources and palette items.
7. Highlights all matching items.
8. Focuses the first match automatically.
9. Allows navigation forwards and backwards through the result set.
10. Attempts to bring the currently focused result into view.

## Search behaviour

Searches are case-insensitive and check several areas of the Flow Builder UI — element cards (by label and type), connector badge labels, and the left-panel toolbox and resources.

![Canvas Search Canvas Highlight](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/canvas-search/flow-canvas-search-canvas-highlight.png)

![Canvas Search Toolbox Highlight](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/canvas-search/flow-canvas-search-toolbox-highlight.png)

## Navigation behaviour

When matches are found, all matches are highlighted, the first match is focused automatically, and the result counter shows the current match position (e.g. `1 of 5`). If no matches are found, the overlay shows `No matches`.

## Keyboard controls

### Open search

Default shortcut: **Ctrl + Shift + F** (configurable in settings)

![Canvas Search Settings Config](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/canvas-search/flow-canvas-search-settings-config.png)

### Navigate matches

- **Enter** — next match
- **Shift + Enter** — previous match
- **Arrow Down** — next match
- **Arrow Up** — previous match
- **Escape** — close overlay

## Highlighting behaviour

The highlight colour is configurable through settings and defaults to `#FFD700`.

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Launch Canvas Search using the configured shortcut or the extension menu.
3. Enter a search term.
4. Review the highlighted matches.
5. Use Enter, Shift+Enter, or the navigation buttons to move through results.
6. Press Escape or use the close button to dismiss the overlay.

## Notes and limitations

- The feature is designed specifically for Salesforce Flow Builder.
- The feature depends on Salesforce DOM structure and selectors remaining compatible.
- Highlight colour and shortcut behaviour depend on settings being available.
