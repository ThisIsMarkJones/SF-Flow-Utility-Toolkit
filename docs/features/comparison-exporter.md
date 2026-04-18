---
layout: default
title: Comparison Exporter
---

# Comparison Exporter

## Overview

**Comparison Exporter** exports Salesforce Flow version comparison results to an Excel workbook based on a pre-defined template.

The feature is designed to help users document Flow version comparisons in a more structured and reusable format by taking the information shown on the Salesforce comparison page and writing it into an `.xlsx` file.

Current behaviour supports:

- the selected Flow/version pair
- comparison summary/result values
- the main changes table
- optional detail text from each **View Details** panel

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Compare Versions page with the Comparison Exporter available from the extension.<br>
Suggested file: <code>/images/comparison-exporter/comparison-exporter-entry-point.png</code>
</div>

## Where it appears

Comparison Exporter is intended for the Salesforce **Compare Flows** page in Setup.

The implementation is designed for the comparison workflow where a user selects two Flow versions and then exports the comparison output through the extension.

## What the feature does

Comparison Exporter currently provides the following functionality:

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

Before the export begins, the feature opens a modal asking whether the export should include detailed change text.

The modal currently includes:

- a title
- a short explanation of the export
- a checkbox for including **View Details** panel text
- a note explaining that detailed export is slower but more complete
- Cancel and Export actions

If the user cancels the modal, the export does not continue.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the export options modal with the Include Details checkbox.<br>
Suggested file: <code>/images/comparison-exporter/comparison-exporter-options-modal.png</code>
</div>

## What gets exported

### Selected version information

The exporter reads the selected Flow/version values from the comparison page, including:

- Flow API name for version X
- Flow version for version X
- Flow API name for version Y
- Flow version for version Y

### Comparison summary and result values

The exporter also reads summary values from the comparison page, including fields such as:

- Analysis Time
- Version Y Last Modified Date
- Version Y Last Modified By
- Version X Status
- Version Y Status
- Added Items
- Updated Items
- Changed Connectors
- Removed Items

### Changes table

The exporter scrapes the comparison changes grid and currently captures values such as:

- Label
- API Name
- Change Type
- Details

The **Details** column may either remain blank or be populated from the **View Details** panels, depending on the export option selected.

## Optional detailed export

If **Include "View Details" panel text** is enabled, the exporter attempts to:

1. find each **View Details** button in the changes table
2. open the detail modal for that row
3. scrape the available detail text
4. close the modal
5. continue to the next row

This produces a richer export, but it is slower because the feature must iterate through the comparison rows one at a time.

The implementation also includes logic to ignore obviously bad or interrupted overlays when scraping detail content.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing a View Details modal that contributes to the exported Details column.<br>
Suggested file: <code>/images/comparison-exporter/comparison-exporter-view-details-modal.png</code>
</div>

## Excel template behaviour

Comparison Exporter writes the output into a template workbook rather than creating an unstructured spreadsheet from scratch.

The current implementation:

- loads the template workbook from the extension
- reads named ranges from the workbook
- populates named ranges for Flow/version selections
- populates named ranges for summary/result values
- writes comparison descriptor labels into specific sheets
- writes the changes table rows into the template table area
- resizes the table if rows were added

The current implementation references sheets including:

- `Comparison Descriptors`
- `Comparison Summary and Results`

It also expects named ranges such as:

- `FC_X_FlowApiName`
- `FC_X_FlowVersion`
- `FC_Y_FlowApiName`
- `FC_Y_FlowVersion`
- `FC_AnalysisTime`
- `FC_Y_LastModifiedDate`
- `FC_Y_LastModifiedBy`
- `FC_X_Status`
- `FC_Y_Status`
- `FC_AddedItems`
- `FC_UpdatedItems`
- `FC_ChangedConnectors`
- `FC_RemovedItems`
- `FC_Changes_FirstDataRow`

If the required starting range for the changes table is missing, the export fails with an error.

## Downloaded file

After the workbook is populated, the exporter creates a browser download for the XLSX file.

The filename is built from the comparison context and follows this pattern:

- `FlowCompare_<FlowApiName>_<VersionX>_to_<VersionY>.xlsx`

The implementation also sanitises the filename values before download.

## User feedback

Comparison Exporter uses toast notifications to communicate progress and status.

Examples of progress states include:

- loading the XLSX library
- scraping comparison data
- scraping change details
- generating the XLSX
- export complete

If the export fails, the feature displays an error toast that includes the error message.

## How to use it

1. Open the Salesforce **Compare Versions** page.
2. Select the two Flow versions to compare.
3. Launch **Comparison Exporter** from the extension.
4. Choose whether to include detailed **View Details** panel text.
5. Confirm the export.
6. Wait while the exporter scrapes the page and generates the workbook.
7. Open the downloaded `.xlsx` file.

## Notes and limitations

Current implementation notes:

- The feature is designed specifically for the Compare Flows page.
- It depends on Salesforce comparison-page DOM structure and selectors remaining compatible.
- Detailed export is slower because it opens and reads each **View Details** panel individually.
- The exporter depends on the bundled XLSX library being successfully injected.
- The exporter also depends on the Excel template workbook being available and containing the expected named ranges.
- If the changes table cannot be found, export may proceed with limited data or fail depending on what is missing.
- Detail scraping depends on the text being present in a reliably readable dialog or panel.

## Template note

The current export is based on a dedicated workbook template rather than a generic spreadsheet.

That means the exported output is intended to align with a pre-defined documentation structure and can be refined later by updating the template itself.

<div class="note-box">
This feature is especially useful when comparison output needs to be retained as formal documentation rather than only reviewed in the Salesforce UI.
</div>

## Future documentation expansion

This page can later be expanded with:

- screenshots of the finished workbook
- a template field-to-output mapping reference
- explanation of the Changes table columns
- troubleshooting guidance if the compare table or detail modal cannot be scraped
- notes on large comparisons and expected export times
