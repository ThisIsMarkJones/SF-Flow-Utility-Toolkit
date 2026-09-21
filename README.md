# SF Flow Utility Toolkit

A browser extension for Chrome, Edge, and Firefox that adds productivity, navigation, analysis, and documentation utilities to Salesforce Flow Builder and related Salesforce automation pages.

[![Install on Chrome](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/sf-flow-utility-toolkit/mjbmlikmdkcakcbilibhbgcjdnidkpfl)
[![Install on Edge](https://img.shields.io/badge/Edge%20Add--ons-Install-blue?logo=microsoftedge)](https://microsoftedge.microsoft.com/addons/detail/sf-flow-utility-toolkit/gmcdggeklbggfiheplhhcmgkcfloeclo)
[![Install on Firefox](https://img.shields.io/badge/Firefox%20Add--ons-Install-blue?logo=firefoxbrowser)](https://addons.mozilla.org/en-US/firefox/addon/sf-flow-utility-toolkit/)
[![Documentation](https://img.shields.io/badge/Documentation-Visit-blue)](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What it does

SF Flow Utility Toolkit enhances the Salesforce Flow Builder experience with a set of focused tools that help Flow builders, administrators, and consultants work more efficiently.

Current features include:

- **Flow Health Check** — analyse a Flow and identify maintainability, reliability, performance, and portability concerns
- **Flow Error Explorer** — translate Flow error debug output into plain-English explanations with suggested fixes
- **Flow Error Dictionary** — browse the full catalogue of Flow error messages and their explanations from anywhere in Setup
- **Import / Export Flows** — export a Flow to a `.flow-meta.xml` file and import one back into the org, without SFDX or the Metadata API
- **Scheduled Flow Explorer** — view all active Schedule-Triggered Flows across the org and see when each is next scheduled to run
- **Unused Resources** — scan the currently open Flow for variables, formulas, text templates, and other resources that are defined but never used
- **Flow List Search** — search and filter the Salesforce Setup Flows list by label, API name, status, and type
- **Canvas Search** — search the Flow canvas, connector labels, and toolbox items
- **API Name Generator** — generate standardised API names for Flow elements and resources using configurable naming patterns and prefixes
- **Flow Version Manager** — bulk-select and delete eligible Flow versions more safely
- **Where Is This Used?** — find every subflow, action, quick action, and Lightning page that references the current Flow
- **Comparison Exporter** — export Flow version comparison results into an Excel workbook
- **Missing Description Flags** — highlight elements, resources, and Flow-level items that are missing descriptions
- **Setup Tabs** — add quick-access Setup tabs for key Flow and automation destinations
- **Flow Trigger Explorer Enhancer** — enrich Flow Trigger Explorer rows with inline metadata and tooltips
- **Flow Metadata & AI Assistant** — work with Flow metadata and generate prompt-ready content for AI-assisted workflows
- **Autosave** — save draft Flows automatically after a configurable period of inactivity, with a countdown you can cancel
- **Keyboard Shortcuts** — drive common Flow Builder canvas actions from the keyboard

---

## Install

### Google Chrome

Install SF Flow Utility Toolkit from the Chrome Web Store:

[Install on Chrome](https://chromewebstore.google.com/detail/sf-flow-utility-toolkit/mjbmlikmdkcakcbilibhbgcjdnidkpfl)

### Microsoft Edge

Install SF Flow Utility Toolkit from Edge Add-ons:

[Install on Edge](https://microsoftedge.microsoft.com/addons/detail/sf-flow-utility-toolkit/gmcdggeklbggfiheplhhcmgkcfloeclo)

### Firefox

Install SF Flow Utility Toolkit from Firefox Add-ons:

[Install on Firefox](https://addons.mozilla.org/en-US/firefox/addon/sf-flow-utility-toolkit/)

---

## Documentation

Full documentation is available at:

**[https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/)**

Documentation includes:

- [Getting Started](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/getting-started.html)
- [Features Overview](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/features/)
- [What's New](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/whats-new.html)

---

## Supported environments

The extension is intended for use with Salesforce environments on the following domains:

- `*.salesforce.com`
- `*.salesforce-setup.com`
- `*.lightning.force.com`
- `*.my.salesforce.com`

---

## Report a bug

If you have found an issue, please use the GitHub issue tracker:

[Open a bug report](https://github.com/ThisIsMarkJones/SF-Flow-Utility-Toolkit/issues)

Before submitting, please include:

- a short summary of the problem
- steps to reproduce the issue
- the browser name and version
- the type of Salesforce Flow or page involved
- any relevant screenshots or console errors

---

## Feature requests

Feature ideas and suggestions are welcome via GitHub Discussions:

[Open a feature request](https://github.com/ThisIsMarkJones/SF-Flow-Utility-Toolkit/discussions/categories/ideas)

---

## Current version

**v7.0.0**

See [What's New](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/whats-new.html) for recent updates.

---

## Build

The extension is packaged into two separate ZIPs for distribution — one for Chrome/Edge and one for Firefox.

`manifest.json` is a development convenience file used when loading the extension unpacked locally. It is not used in builds.

The browser-specific manifests are the source of truth:
- `manifest.chrome.json` — used for Chrome Web Store and Edge Add-ons submissions
- `manifest.firefox.json` — used for Firefox Add-ons (AMO) submissions

The ZIP job renames the appropriate browser manifest to `manifest.json` before packaging. The other browser manifest and `manifest.json` are excluded from the ZIP entirely.

---

## License

This project is licensed under the [MIT License](LICENSE).