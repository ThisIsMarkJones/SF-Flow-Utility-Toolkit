---
layout: default
title: Setup Tabs | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Setup Tabs

## Overview

**Setup Tabs** adds quick-access navigation tabs into Salesforce's existing Setup tab bar to make it easier to move between commonly used Flow-related destinations.

Current tab support includes:

- Flows
- Flow Trigger Explorer
- Process Automation Settings
- Automation Home (optional)

![Setup Tabs Injected Tabs (No Automation Home)](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/setup-tabs/setup-tabs-injected-tabs-no-automation-home.png)

![Setup Tabs Injected Tabs (With Automation Home)](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/setup-tabs/setup-tabs-injected-tabs-with-automation-home.png)

## Where it appears

Setup Tabs is intended for Salesforce Setup pages where the standard Setup tab bar is present.

## Injected tabs

- **Flows** — links to the Setup Flows home page (opens in current tab)
- **Flow Trigger Explorer** — links to the Flow Trigger Explorer page (opens in new tab, different subdomain)
- **Process Automation Settings** — links to the relevant Setup page (opens in current tab)
- **Automation Home** *(optional)* — links to `/lightning/app/standard__FlowsApp` (opens in new tab)

## Settings and configuration

| Setting | Description |
|---|---|
| **Setup Tabs** | Master toggle |
| **Automation Home Tab** | Enables the optional Automation Home tab (disabled by default) |

![Setup Tabs Settings Options](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/setup-tabs/setup-tabs-settings-options.png)

## How to use it

1. Enable **Setup Tabs** in the toolkit settings.
2. Open a Salesforce Setup page where the Setup tab bar is present.
3. Wait for the custom tabs to appear.
4. Click a tab to navigate to the desired destination.

## Notes and limitations

- The feature depends on Salesforce's Setup tab bar being present and detectable.
- Some destinations intentionally open in a new browser tab because they use a different Salesforce subdomain or app context.
- If the Setup tab bar cannot be found, the feature will not inject its custom tabs.
- The Automation Home tab is optional and disabled by default.
