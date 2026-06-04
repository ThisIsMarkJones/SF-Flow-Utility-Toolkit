---
layout: default
title: Flow Version Manager | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Flow Version Manager

## Overview

**Flow Version Manager** enhances the Salesforce Flow versions page by adding bulk-selection controls and a guided way to delete multiple Flow versions more safely.

![Flow Version Manager Disabled Row and Button](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/flow-version-manager/flow-version-manager-disabled-row-and-button.png)

## Where it appears

Flow Version Manager is intended for the Salesforce **Flow details / versions page** in Setup.

## What the feature does

1. Detects whether the current page is likely to be a Flow versions/details page.
2. Finds the Salesforce versions table.
3. Injects a checkbox column into the table header.
4. Adds row-level checkboxes for supported versions.
5. Tracks selected versions internally.
6. Adds a **Delete Selected Versions** action button to the page button bar.
7. Prevents active versions from being selected for deletion.
8. Opens a confirmation modal before deletion begins.
9. Requires the user to type **DELETE** before continuing.
10. Queues and processes deletions using Salesforce's native delete links.
11. Shows a completion toast after deletion is finished.

## Selection behaviour

Each eligible version row receives a checkbox. The bulk delete button label updates dynamically, e.g. `Delete Selected Versions (3)`. Active versions cannot be selected for deletion.

![Flow Version Manager Selectable Row and Button](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/flow-version-manager/flow-version-manager-selectable-row-and-button.png)

## Confirmation modal

Before deletion begins, the feature opens a confirmation modal showing:

- a short confirmation message
- a warning about in-progress interviews
- a list of the selected versions
- an input requiring the user to type **DELETE**
- Cancel and Delete action buttons

The user must type **DELETE** exactly before the destructive action button is enabled.

![Flow Version Manager Deletion Module](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/flow-version-manager/flow-version-manager-deletion-module.png)

## How to use it

1. Open a Flow details page that includes the versions table.
2. Select one or more deletable versions using the added checkboxes.
3. Click **Delete Selected Versions**.
4. Review the list of selected versions in the modal.
5. Type **DELETE** to confirm.
6. Allow the queued deletion process to complete.

## Notes and limitations

- Active versions cannot be deleted through this feature.
- The feature uses session storage to manage queued delete operations.
- Because it relies on Salesforce's native delete action links, changes to the underlying page structure may require future updates.
- Deleting Flow versions is a destructive action and should be treated carefully, ideally during off-peak hours.
