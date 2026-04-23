---
layout: default
title: Setup Tabs
---

# Setup Tabs

## Overview

**Setup Tabs** adds quick-access navigation tabs into Salesforce’s existing Setup tab bar to make it easier to move between commonly used Flow-related destinations.

The feature is intended to reduce navigation friction by placing direct shortcuts into the Setup tab area for pages that Flow builders and admins may use frequently.

Current tab support includes:

- Flows
- Flow Trigger Explorer
- Process Automation Settings

![Setup Tabs Injected Tabs (No Automation Home)]({{ '/images/setup-tabs/setup-tabs-injected-tabs-no-automation-home.png' | relative_url }})

An optional additional tab is also available for:

- Automation Home

![Setup Tabs Injected Tabs (With Automation Home)]({{ '/images/setup-tabs/setup-tabs-injected-tabs-with-automation-home.png' | relative_url }})

## Where it appears

Setup Tabs is intended for Salesforce Setup pages where the standard Setup tab bar is present.

The feature looks for the existing Setup tab bar and injects additional custom tabs into that same navigation area.

## What the feature does

Setup Tabs currently provides the following functionality:

1. Checks whether the feature is enabled.
2. Waits for the Salesforce Setup tab bar to appear.
3. Injects custom quick-access tabs into the existing tab bar.
4. Builds destination URLs based on the current hostname and environment.
5. Opens Setup-based destinations in the current tab where appropriate.
6. Opens cross-domain destinations in a new browser tab where appropriate.
7. Supports optional injection of an additional Automation Home tab.
8. Removes or reinjects tabs when settings change.

## Injected tabs

### Flows

The **Flows** tab links to the Salesforce Setup Flows home page.

This tab opens in the current tab.

### Flow Trigger Explorer

The **Flow Trigger Explorer** tab links to the Flow Trigger Explorer page.

Because this page lives on a different subdomain from the Setup domain, it opens in a **new browser tab**.

### Process Automation Settings

The **Process Automation Settings** tab links to the relevant Salesforce Setup page.

This tab opens in the current tab.

### Automation Home

The **Automation Home** tab is optional.

When enabled, it links to the Automation App home using the known Lightning app route:

- `/lightning/app/standard__FlowsApp`

This tab opens in a **new browser tab**.

## Navigation behaviour

The feature determines whether a tab should open in the current tab or a new browser tab based on the destination.

### Same-tab navigation

These destinations are intended to open in the current tab:

- Flows
- Process Automation Settings

For these tabs, the feature attempts to use Salesforce navigation where possible and falls back to standard browser navigation if needed.

### New-tab navigation

These destinations are intended to open in a new browser tab:

- Flow Trigger Explorer
- Automation Home

This behaviour is especially important for destinations that live on a different Salesforce subdomain or in a different Lightning app context.

## Active tab behaviour

The feature also checks the current URL to determine whether one of the injected tabs should appear active.

Current active-state checks cover:

- Flows
- Flow Trigger Explorer
- Process Automation Settings
- Automation Home

This helps the added tabs feel more consistent with the rest of the Salesforce tab bar.

## Settings and configuration

Setup Tabs is controlled through settings.

### Master toggle

The main feature is controlled by:

- `setupTabs.enabled`

If this setting is off, the custom tabs are not injected.

### Optional Automation Home toggle

The optional Automation Home tab is controlled by:

- `setupTabs.automationHome.enabled`

If the main Setup Tabs feature is enabled and this setting is also enabled, the extra Automation Home tab is injected.

### Settings page support

The settings page includes a dedicated toggle for:

- Setup Tabs
- Automation Home Tab

This allows users to control whether the base tabs and optional extra tab should appear.

![Setup Tabs Settings Options]({{ '/images/setup-tabs/setup-tabs-settings-options.png' | relative_url }})

## How URLs are built

The feature derives destination URLs from the current hostname.

It includes logic for:

- Setup hostnames using `salesforce-setup.com`
- Lightning hostnames using `lightning.force.com`

This allows the feature to build the correct destination URLs for the current org/environment without requiring manual configuration.

## How to use it

1. Enable **Setup Tabs** in the toolkit settings or from the extension.
2. Open a Salesforce Setup page where the Setup tab bar is present.
3. Wait for the custom tabs to appear.
4. Click a tab to navigate to the desired destination.
5. Optionally enable **Automation Home Tab** in settings if you want that additional shortcut.

## Enable and disable behaviour

Setup Tabs can be toggled on and off.

When enabled, the custom tabs are injected into the Setup tab bar.

When disabled, the custom tabs are removed.

The feature also responds to settings changes so that tab injection can be updated without requiring a full manual reconfiguration.

## Notes and limitations

Current implementation notes:

- The feature depends on Salesforce’s Setup tab bar being present and detectable.
- It is designed around the current Setup tab bar DOM structure.
- Some destinations intentionally open in a new browser tab because they use a different Salesforce subdomain or app context.
- The feature relies on URL patterns and environment-derived hostnames rather than a deeper metadata lookup process.
- If the Setup tab bar cannot be found, the feature will not inject its custom tabs.
- The Automation Home tab is optional and is disabled by default in the settings defaults currently supplied.

## Accessibility and usability notes

The current implementation includes:

- labelled tab text for each injected tab
- active-state handling based on the current URL
- user-facing settings toggles for enabling/disabling the feature
- toast feedback when the feature is enabled or disabled via activation
