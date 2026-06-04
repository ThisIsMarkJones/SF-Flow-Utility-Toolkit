---
layout: default
title: Unused Resources Finder | SF Flow Utility Toolkit
---

# Unused Resources Finder

## Overview

**Unused Resources Finder** scans the currently open Salesforce Flow and identifies user-authored resources — such as variables, formulas, and text templates — that are defined in the flow but not referenced anywhere within it. These are candidates for clean-up to reduce clutter and improve flow maintainability.

## Where it appears

Unused Resources Finder is accessible from the toolkit side button menu when a Flow is open in **Salesforce Flow Builder**.

## What the feature does

When activated, the feature:

1. Opens the Manager tab in Flow Builder (to ensure resources are loaded).
2. Retrieves the current flow's metadata via the Salesforce Tooling API.
3. Scans all resource definitions and all element references throughout the flow.
4. Identifies resources that are not referenced by any element or other resource.
5. Displays the findings in a modal, grouped by resource type.
6. Injects warning indicators (⚠) on unused resources in the Manager tab toolbox.

## Supported resource types

The scanner checks the following resource types, which correspond to standalone Manager-tab resources:

- Variables
- Constants
- Formulas
- Text Templates
- Choices
- Choice Sets
- Stages

Element-derived items (such as Get Records output variables or loop iteration variables) are not in scope — they live on their parent elements and are excluded automatically.

## The report modal

The modal shows:

- The flow label and a summary count (e.g. "3 of 12 resources are unused")
- Results grouped by resource type
- Each unused resource listed with its name, data type, and description (where available)
- A clickable row for each resource — clicking attempts to open that resource in the Flow Builder Manager tab

If there are no unused resources, the modal displays a confirmation message.

## Manager tab indicators

After the scan completes, unused resources are highlighted in the Flow Builder Manager tab toolbox with a ⚠ indicator. These indicators are cleared when the modal is closed or when the feature is re-run.

## Notes and limitations

- The feature runs against the currently open flow version.
- Reference detection covers: fields ending in `Reference` or `References`, and merge field syntax (`{!ResourceName}`) in string values.
- Connector target references (`targetReference`) are excluded — these point to elements, not resources.
- A resource that is defined but only referenced by another unused resource will still be flagged as unused.
- Click-to-navigate in the Manager tab is best-effort. Salesforce's Flow Builder left panel is a Lightning Web Component tree with no published API. If navigation fails, a toast message directs you to open the Manager tab manually.
- The feature requires Tooling API access to retrieve flow metadata. If metadata cannot be fetched, an error is displayed in the modal.