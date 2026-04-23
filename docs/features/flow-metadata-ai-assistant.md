---
layout: default
title: Flow Metadata & AI Assistant
---

# Flow Metadata & AI Assistant

## Overview

**Flow Metadata & AI Assistant** is a combined metadata and prompt-generation feature for Salesforce Flow Builder.

It provides a side-panel experience that helps users:

- review Flow metadata in a more usable format
- copy or download Flow metadata as JSON
- generate AI-ready prompts using built-in templates
- choose between raw and cleaned metadata depending on the task
- estimate prompt size before copying content into an external AI tool

The feature is designed to support documentation, design analysis, testing, improvement review, and diagram generation workflows.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Flow Metadata & Flow Metadata & AI Assistant panel open in Flow Builder.<br>
Suggested file: <code>/images/ai-assistant/ai-assistant-panel-overview.png</code>
</div>

## Where it appears

Flow Metadata & AI Assistant is intended for **Salesforce Flow Builder**.

When activated, it opens a panel overlay titled:

**Flow Metadata & Flow Metadata & AI Assistant**

The panel is displayed over the current Flow Builder page and can be closed by:

- clicking the close button
- pressing **Escape**
- clicking outside the panel on the overlay

## What the feature does

Flow Metadata & AI Assistant currently provides the following functionality:

1. Detects that the user is in Flow Builder.
2. Opens a dedicated panel overlay when activated.
3. Retrieves the current Flow metadata using the current Flow ID.
4. Builds both a raw metadata object and a cleaned metadata version.
5. Displays a high-level Flow summary.
6. Provides metadata copy and download actions.
7. Lets the user choose an AI prompt template.
8. Lets the user choose between raw and cleaned metadata.
9. Shows an estimated token count for the assembled prompt.
10. Copies the assembled prompt to the clipboard for use in an external AI tool.

## Panel sections

The panel is currently divided into three main sections.

### Flow Summary

The Flow Summary section displays core metadata about the current Flow, including:

- Label
- Type
- Status
- API Version
- Element summary
- Resource summary

This gives the user a quick overview before choosing whether to copy metadata or generate a prompt.

### Flow Metadata

The metadata section provides actions for working with the current Flow metadata directly.

It currently shows:

- estimated token count for raw metadata
- estimated token count for cleaned metadata
- approximate token saving percentage when using cleaned metadata

It also provides action buttons for:

- Copy Raw
- Copy Clean
- Download Raw
- Download Clean

### AI Prompt Assistant

The AI Prompt Assistant section allows the user to:

- select a prompt template
- view a short template description
- choose between **Clean** and **Raw** metadata
- view a prompt-size token estimate
- copy the assembled prompt to the clipboard

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the Flow Summary and Metadata actions sections.<br>
Suggested file: <code>/images/ai-assistant/ai-assistant-summary-and-metadata.png</code>
</div>

## Metadata formats

AI Assistant currently supports two metadata formats.

### Raw metadata

Raw metadata is the Flow metadata returned directly from the source record.

This format is useful when the user wants the fullest available JSON representation.

### Clean metadata

Clean metadata is a processed version of the Flow metadata.

The cleaned version is intended to reduce unnecessary payload and improve usefulness for AI-assisted workflows by focusing on the parts most likely to matter.

The panel also shows an estimated token saving percentage to help users choose between raw and cleaned JSON.

## Metadata actions

The current metadata actions are:

- **Copy Raw**
- **Copy Clean**
- **Download Raw**
- **Download Clean**

### Copy actions

Copy actions place the selected JSON content onto the clipboard.

If the normal clipboard API is not available, the feature includes a fallback copy approach.

### Download actions

Download actions create a downloadable JSON file using the current Flow name.

Generated filenames follow this pattern:

- `<FlowName>_raw.json`
- `<FlowName>_clean.json`

## Prompt templates

The AI Assistant includes a registry of prompt templates that can be selected from a dropdown.

Current templates include:

- **Summarise Flow**
- **Generate Flow, Element, and Resource Descriptions**
- **Generate Draw.io Diagram**
- **Suggest Improvements**
- **Generate Test Scenarios**

Each template includes:

- an internal ID
- a display title
- a short description
- a prompt prefix

When a template is selected, the assistant assembles the final prompt by combining the template prompt text with either the raw or cleaned metadata JSON.

<div class="screenshot-placeholder">
<strong>Screenshot placeholder:</strong> Add a screenshot here showing the prompt template dropdown and metadata format selection.<br>
Suggested file: <code>/images/ai-assistant/ai-assistant-template-selection.png</code>
</div>

## Current prompt template purposes

### Summarise Flow

Produces a plain-English summary of the Flow intended to be suitable for a Salesforce Flow description.

### Generate Flow, Element, and Resource Descriptions

Produces structured documentation output including:

- a Flow summary
- a paste-ready Flow description
- grouped Flow element descriptions
- grouped resource descriptions
- paste-ready description snippets

### Generate Draw.io Diagram

Produces Draw.io compatible XML intended to represent the Flow visually.

### Suggest Improvements

Analyses the Flow against best-practice themes such as:

- performance
- error handling
- maintainability
- security
- governor limits
- general best practices

### Generate Test Scenarios

Produces structured test scenarios intended to exercise Flow paths, branches, edge cases, and fault handling.

## Token estimation

AI Assistant shows estimated token counts to help users judge prompt size before copying content into an AI tool.

The token estimate updates when:

- the selected template changes
- the metadata format changes

This helps users compare the likely size impact of:

- raw vs cleaned metadata
- shorter vs longer prompt templates

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Launch **AI Assistant** from the extension.
3. Wait for the current Flow metadata to be retrieved.
4. Review the Flow Summary section if needed.
5. Choose whether you want to work with raw or cleaned metadata.
6. Select a prompt template.
7. Review the token estimate.
8. Click **Copy Prompt to Clipboard**.
9. Paste the copied prompt into your preferred AI tool.

You can also use the panel purely for metadata operations without using the prompt-generation section.

## User feedback

The panel includes a status area that is used to show action feedback such as:

- metadata copied to clipboard
- metadata downloaded
- prompt copied
- errors or failures

If metadata retrieval fails, the panel shows an explicit error message instead of the normal content.

## Notes and limitations

Current implementation notes:

- The feature is designed specifically for Salesforce Flow Builder.
- It depends on the current Flow ID being available from the URL.
- It depends on successful metadata retrieval for the current Flow.
- The quality of AI outputs depends on the selected prompt template and the metadata supplied to the external AI tool.
- The assistant currently prepares prompts and metadata, but does not itself execute an external AI model.
- Token estimates are approximate and intended as a planning aid rather than an exact model-specific count.
- The feature relies on supporting utilities such as the metadata cleaner, settings manager, and prompt template registry.

## Settings behaviour

The current implementation reads a default AI template setting from storage.

This means the prompt template dropdown can open with a configured default selection rather than always starting from the same template.

## Accessibility and usability notes

The current implementation includes:

- a dedicated panel overlay
- Escape-to-close support
- visible loading and error states
- copy/download actions grouped by purpose
- template descriptions shown inline
- explicit raw/clean metadata selection
- token estimates for prompt planning

## Future documentation expansion

This page can later be expanded with:

- example outputs for each template
- more guidance on when to choose raw vs clean metadata
- screenshots of the copy/download workflow
- screenshots of the generated JSON files
- troubleshooting guidance for metadata retrieval failures
- guidance on which template is best for different admin or consultant tasks
