---
layout: default
title: Comparison Exporter | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# Comparison Exporter

## Overview

**Comparison Exporter** exports Salesforce Flow version comparison results to an Excel workbook based on a pre-defined template.

![Comparison Exporter Side Bar Module](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/comparison-exporter/comparison-exporter-side-bar-module.png)

## Where it appears

Comparison Exporter is intended for the Salesforce **Compare Flows** page in Setup.

## What the feature does

1. Detects that the user is on the Compare Flows page.
2. Loads the bundled XLSX library when export begins.
3. Opens an export options modal.
4. Scrapes the selected Flow/version information from the page.
5. Scrapes comparison result values such as analysis time and item counts.
6. Scrapes the basic changes table.
7. Optionally opens each **View Details** action to capture detail text.
8. Loads the Excel template workbook.
9. Populates named ranges and the comparison changes table in the workbook.
10. Triggers a browser download of the generated XLSX file.

## Export options modal

Before the export begins, the feature opens a modal with a checkbox for including **View Details** panel text. Detailed export is slower but more complete.

![Comparison Exporter Export Module](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/comparison-exporter/comparison-exporter-export-module.png)

## What gets exported

- Selected Flow/version information (API names and version numbers for both compared versions)
- Comparison summary values (Analysis Time, Last Modified Date/By, Status, Added/Updated/Changed/Removed item counts)
- Changes table (Label, API Name, Change Type, Details)

## Downloaded file

The filename follows this pattern: `FlowCompare_<FlowApiName>_<VersionX>_to_<VersionY>.xlsx`

## How to use it

1. Open the Salesforce **Compare Versions** page.
2. Select the two Flow versions to compare.
3. Launch **Comparison Exporter** from the extension.
4. Choose whether to include detailed **View Details** panel text.
5. Confirm the export.
6. Wait while the exporter scrapes the page and generates the workbook.
7. Open the downloaded `.xlsx` file.

## Notes and limitations

- The feature depends on Salesforce comparison-page DOM structure and selectors remaining compatible.
- Detailed export is slower because it opens and reads each **View Details** panel individually.
- The exporter depends on the bundled XLSX library and the Excel template workbook containing the expected named ranges.
