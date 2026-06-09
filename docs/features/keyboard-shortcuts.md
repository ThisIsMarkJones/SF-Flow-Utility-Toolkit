---
layout: default
title: Keyboard Shortcuts | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Keyboard Shortcuts

## Overview

**Keyboard Shortcuts** adds a set of keyboard shortcuts to Salesforce Flow Builder, covering common canvas actions that would otherwise require reaching for the toolbar or navigating menus.

All canvas shortcuts use **Shift + Letter** and are scoped to Flow Builder only. Shortcuts do not fire when the cursor is focused inside a text input, textarea, or other editable field.

## Where it appears

Keyboard Shortcuts are active in **Salesforce Flow Builder**. The global sidebar shortcut is active on all pages where the toolkit side button is present.

## Canvas shortcuts

| Shortcut | Action |
|----------|--------|
| Shift + S | Save |
| Shift + D | Debug |
| Shift + R | Run |
| Shift + E | Add New Element |
| Shift + V | New Resource |
| Shift + M | Toggle Toolbox |
| Shift + F | Open Errors panel — Errors tab |
| Shift + W | Open Errors panel — Warnings tab |
| Shift + X | View Properties (Flow Settings) |
| Shift + A | Select Elements |
| Shift + Z | Undo |
| Shift + Y | Redo |
| Shift + T | Activate / Deactivate |
| Shift + H | Show / Hide Advanced |

## Global shortcut

| Shortcut | Action |
|----------|--------|
| Cmd + Shift + U (Mac) / Ctrl + Shift + U (Windows) | Open Utility Sidebar |

## Native Salesforce shortcut (no implementation required)

| Shortcut | Action |
|----------|--------|
| Cmd + Shift + S (Mac) / Ctrl + Shift + S (Windows) | Save As New Version |

This shortcut is built into Salesforce Flow Builder and works without the extension.

## Behaviour notes

**Save (Shift + S)** — only fires if the Save button is currently enabled. If there are no unsaved changes, a toast confirms there is nothing to save.

**Add Element (Shift + E)** — clicks the first visible, enabled connector button on the canvas. If no connector is available, a toast is shown.

**New Resource (Shift + V)** — opens the Toolbox panel if it is not already visible before triggering the New Resource button.

**Errors / Warnings tabs (Shift + F / Shift + W)** — opens the Errors panel if it is not already visible, then navigates to the relevant tab.

**Activate / Deactivate (Shift + T)** — only one of these buttons is present at a time depending on the current Flow state. The shortcut clicks whichever is available. If the Flow has unsaved changes, neither button is present and a toast explains why.

**Show / Hide Advanced (Shift + H)** — requires the Flow Settings panel to be open first (Shift + X). If the panel is not open, a toast prompts the user to open it.

If a target button is absent or disabled, a warning toast is shown rather than silently doing nothing.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Keyboard Shortcuts enabled | On | Enables or disables all keyboard shortcuts |

## Notes and limitations

- Shortcuts do not fire when focus is inside a text input, textarea, select element, or contenteditable area.
- The shortcut set is fixed and cannot currently be reconfigured per shortcut.
- Shortcuts depend on Salesforce Flow Builder toolbar buttons being present and accessible in the DOM.