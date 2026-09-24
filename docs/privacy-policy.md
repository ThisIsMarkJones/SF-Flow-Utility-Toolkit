---
layout: default
title: Privacy Policy | SF Flow Utility Toolkit
meta-description: What data SF Flow Utility Toolkit accesses, stores, and transmits, and what it does not.
---

# Privacy Policy

**Last updated:** September 2026

SF Flow Utility Toolkit ("the extension") is a browser extension for Google Chrome, Microsoft Edge, and Mozilla Firefox that provides productivity, analysis, and documentation tools for use within Salesforce Flow Builder and related Salesforce automation pages.

## What data the extension accesses

The extension accesses Salesforce Flow and automation data from the user's own Salesforce organisation in order to provide its features.

This may include:

- Flow metadata
- Flow definitions
- element and resource names
- descriptions
- version information
- Flow version status and activation state
- comparison data
- trigger explorer details
- Flow schedule and recurrence information
- Flow runtime error and debug information shown on the page
- deployment status information for deployments the extension initiates
- related configuration information


The extension may also access Salesforce authentication or session information already present in the user's browser session where required to make authorised requests to the user's own Salesforce organisation.

This data is accessed only to support the extension's user-facing features, such as:

- Flow Health Check
- Flow Error Explorer and Error Dictionary
- Import / Export Flows
- Scheduled Flow Explorer
- Unused Resources Finder
- Missing Description Flags
- API Name Generator
- Comparison Exporter
- Where Is This Used?
- AI Assistant
- Flow Version Manager
- related Flow Builder and Setup enhancements


## How the extension uses data

The extension uses accessed Salesforce data only to provide or improve its user-facing functionality inside the browser.

Examples include:

- analysing Flow metadata
- translating Flow runtime error messages into plain-English explanations
- converting Flow metadata to and from Metadata API XML
- comparing an imported Flow file against Flow versions already in the organisation
- calculating when Schedule-Triggered Flows will next run
- identifying Flow resources that are defined but never referenced
- highlighting missing descriptions
- generating API names
- exporting Flow comparison results
- assembling AI prompt content
- enhancing Flow Trigger Explorer rows
- supporting Flow version management actions


The extension does not use accessed data for advertising, profiling, or analytics.

## Files and changes the extension makes on request

Some features act on local files or make changes in the user's Salesforce organisation. These actions only ever happen in response to a direct user action in the extension's interface.

**Files the extension writes.** Where a feature produces an export, the resulting file is generated in the browser and saved through the browser's own download mechanism. Examples include Flow metadata exported as a `.flow-meta.xml` file, Flow comparison results exported as a spreadsheet, and reference results exported as a CSV. These files are not transmitted anywhere by the extension.

**Files the extension reads.** The Import / Export Flows feature reads a `.flow-meta.xml` file that the user explicitly selects through a file picker or drag and drop. The file is read in the browser, and its contents are used only to validate the file, compare it against the organisation, and assemble the deployment requested by the user. The extension does not browse, scan, or access any other file on the user's device.

**Changes the extension makes in Salesforce.** Some features can change data in the user's own Salesforce organisation, using that user's existing permissions. Specifically, Import / Export Flows deploys a Flow as a new version through the Salesforce Metadata API when the user confirms the import, and Flow Version Manager deletes Flow versions the user has selected for deletion. Both require explicit confirmation, and neither is performed automatically or in the background.

## What data the extension stores

The extension stores certain data locally in the browser to support settings and feature behaviour.

This may include:

- user preferences and feature settings
- keyboard shortcut preferences
- colour and naming pattern preferences
- custom prefix configuration
- temporary session state needed for in-progress actions
- limited cached metadata used to improve some extension features, such as Flow Trigger Explorer row enrichment


Stored data remains in browser storage unless cleared by the user, overwritten by the extension, or removed when the extension is uninstalled.

## What data the extension transmits

All network requests made by the extension are intended to go only to the user's own Salesforce organisation.

This includes deployment requests. Where the user confirms an import, the Flow metadata is packaged in the browser and sent only to the user's own Salesforce organisation through its Metadata API.

The extension does not transmit Salesforce data, exported files, or imported files to the extension developer or to third-party servers for analytics, advertising, or resale.

## Third-party services

The extension does not use third-party analytics, advertising, tracking, or data brokerage services.

The extension may use bundled third-party libraries locally within the extension package where needed for feature functionality, but not as external data collection services.

## Data sharing

The extension does not sell, transfer, or share user data with third parties except where required to provide the feature within the user's own Salesforce environment, to comply with applicable law, or to protect against abuse, fraud, or security threats.

## Data retention

Salesforce data accessed by the extension is generally processed within the browser for active feature use.

Some feature-related data may be cached or stored locally in the browser to support settings, improve usability, or allow temporary in-progress actions to complete. The duration of that storage depends on the feature and the browser storage used.

Users can remove extension-stored settings and local data by clearing browser extension storage, resetting relevant extension settings, or uninstalling the extension.

## Chrome Web Store User Data Policy

SF Flow Utility Toolkit's use of user data is intended to comply with the Chrome Web Store User Data Policy, including the Limited Use requirements.

The extension uses accessed data only for its disclosed user-facing functionality and does not use that data for personalised advertising or sell it to third parties.

The same approach applies to the Firefox Add-ons and Microsoft Edge Add-ons listings. The Firefox build declares no data collection permissions.

## Changes to this policy

If this privacy policy is updated, the revised version will be published at this URL with an updated **Last updated** date.

## Contact

If you have questions about this privacy policy, please [open an issue on the GitHub repository](https://github.com/ThisIsMarkJones/SF-Flow-Utility-Toolkit/issues).
