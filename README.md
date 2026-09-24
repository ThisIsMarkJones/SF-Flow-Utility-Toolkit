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

## Acknowledgements

The following projects inspired features of SF Flow Utility Toolkit, which is an independent
implementation and contains none of their code.

- **[SF Tabs](https://github.com/chrisrouse/sftabs)** by Chris Rouse — inspired the Setup Tabs
  feature. If you already use SF Tabs, we recommend sticking with it rather than enabling Setup
  Tabs here.
- **[Salesforce Flow MetaData Downloader](https://chromewebstore.google.com/detail/salesforce-flow-metadata/bdonpnepbmgmhgciooglhfdnoepfnpkp)**
  by physicshaurya — partly inspired Flow Health Check and the AI prompts.

---

## Licence and attribution

This project is licensed under the [MIT Licence](LICENSE). You are free to use it,
modify it, and use it commercially, including in closed-source and paid products.

### What the licence requires

The MIT Licence has one condition, and it is not optional:

> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.

In practice, that means the copyright notice and the full permission notice must travel
with the code in **all** of the following cases:

- **Copies and forks** — whole files, or substantial portions of them, reused in another project.
- **Ports and translations** — rewriting the source into another language (for example TypeScript)
  does not create new, unencumbered code. A port of a substantial portion is still a derivative of
  this project and must carry the notice.
- **Bundled, compiled, transpiled, or minified builds** — stripping comments during a build step
  does not remove the obligation. If the notice is stripped from the bundle, it must be reproduced
  somewhere the recipient can actually find it, such as a licence file shipped with the build.
- **Published packages and extensions** — anything distributed to others, including npm packages
  and browser extension store listings, must include the notice in the distributed artefact.

Removing or omitting the notice means the licence grant no longer applies, and the copy is simply
an infringing one.

### How to attribute correctly

1. **Include the licence text.** Copy the contents of [LICENSE](LICENSE) into a `NOTICE` or
   `THIRD_PARTY_NOTICES` file in your project, alongside your other third-party notices. For a
   bundled or minified build, ship that file with the build.

2. **Add a visible credit line.** Somewhere a reader will actually see it — your README, your
   documentation, or an about page — include a line such as:

   > Includes code from SF Flow Utility Toolkit by Mark Jones (MIT) — https://github.com/ThisIsMarkJones/SF-Flow-Utility-Toolkit

Every first-party source file in this repository also carries a two-line SPDX header. Keeping
those headers in place when you copy a file is the simplest way to stay compliant.

### A polite request

The following is a **request, not a licence requirement**. You are under no obligation to do any
of it.

If you ship something built on this project, please also credit it on your store listing and
about page, not only in your notices file. A visible credit costs very little and makes a real
difference to a small independent project.

If you are building on this work, I would genuinely like to hear about it. Please get in touch via
[GitHub issues](https://github.com/ThisIsMarkJones/SF-Flow-Utility-Toolkit/issues) — whether to
share what you have made, ask a licensing question, or discuss a different licensing arrangement.
