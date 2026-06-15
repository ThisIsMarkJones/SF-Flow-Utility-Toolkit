---
layout: default
title: Autosave | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Autosave

## Overview

**Autosave** monitors the Flow Builder canvas for unsaved changes and automatically triggers a save after a configurable period of inactivity. A status pill in the Flow Builder toolbar shows the current autosave state at a glance.

## Where it appears

Autosave is active in **Salesforce Flow Builder** on inactive (draft) Flows only. It does not apply to active Flows, as active Flows cannot be saved directly without creating a new version.

## What the feature does

1. Watches the native Salesforce Save button using a MutationObserver.
2. When the Save button becomes enabled (indicating unsaved changes), starts an inactivity timer.
3. Resets the timer on keyboard input or canvas mouse clicks — mouse movement and scrolling do not reset the timer.
4. When the inactivity window elapses, displays a 30-second countdown in the toolbar pill.
5. If the user interacts during the countdown, cancels the countdown and restarts the inactivity timer.
6. On countdown completion, clicks the native Salesforce Save button.
7. Shows a toast confirming the autosave occurred.
8. Resets and watches for the next unsaved change.

## Toolbar pill

A status pill is injected into the Flow Builder toolbar to the left of the Save button. It reflects the current autosave state:

| State | Display |
|-------|---------|
| Idle (no unsaved changes) | Autosave: On |
| Armed (unsaved changes, inactivity timer running) | Autosave: On |
| Countdown | Saving in 0:28… |
| Just saved | Saved ✓ |

## Inactivity detection

The timer resets on:

- Any keyboard input (typing, shortcuts, Undo, Redo)
- Mouse clicks within the Flow Builder canvas or toolbar

The timer does **not** reset on mouse movement or scrolling. This prevents screen activity such as taking screenshots from indefinitely deferring a save.

## Settings

The autosave interval is configurable in the extension settings page.

| Setting | Default | Description |
|---------|---------|-------------|
| Autosave enabled | Off | Enables or disables the feature |
| Interval (minutes) | 3 | Inactivity period before the 30-second countdown begins |

## How to use it

1. Enable Autosave in the extension settings page.
2. Open a Flow in Salesforce Flow Builder.
3. Make changes to the Flow — the toolbar pill will show **Autosave: On** once the Save button is enabled.
4. Stop interacting with the canvas. The countdown will begin after the configured interval.
5. If you resume editing during the countdown, it will cancel and restart automatically.
6. When the countdown completes, the Flow is saved and a **Saved ✓** confirmation appears.

## Notes and limitations

- Autosave only operates on draft (inactive) Flows. Active Flows require a deliberate save to create a new version.
- The feature depends on the native Salesforce Save button being present in the Flow Builder toolbar.
- Autosave is disabled by default and must be enabled in settings before use.