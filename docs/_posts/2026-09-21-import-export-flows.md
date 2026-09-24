---
layout: post
title: "Import / Export Flows"
date: 2026-09-21 00:00:00 +0000
categories: announcement
---

v7.0.0 introduces **Import / Export Flows**, which moves Flow metadata in and out of a Salesforce org from the browser — no SFDX, no Metadata API SOAP endpoints, and no local development environment.

Both halves live in a single panel, opened from the toolkit side button.

## Export

From Flow Builder, export the flow currently open on the canvas as a `.flow-meta.xml` file — the same source format a Metadata API retrieve produces. Commit it to version control, attach it to a ticket, review it offline, or hand it to another org.

## Import

From the Setup Flows list, import a `.flow-meta.xml` file back into the org as a new version. Nothing is created until the import has passed every check:

* the file name and XML are validated before any request is made
* the org is queried for existing versions of that flow
* the file is compared against the active version, or against a version you choose when a newer inactive version also exists
* the change list shows exactly which elements were added, changed, and removed
* an import identical to what is already in the org is blocked rather than creating a duplicate version
* the deploy is polled with live status until Salesforce reports the outcome

Imports always create a **new version** — nothing is overwritten, replaced, or deleted. Every import lands as an **inactive draft** unless you explicitly opt in to activating it, and that option only appears when the source file came from an active version.

Selecting and exporting multiple flows as a ZIP is not part of this release and is planned for a later one.

For full details, see [Import / Export Flows]({{ '/features/import-export-flows.html' | relative_url }}).
