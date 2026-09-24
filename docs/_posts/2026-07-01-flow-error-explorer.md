---
layout: post
title: "Flow Error Explorer"
date: 2026-07-01 12:00:00 +0000
categories: announcement
---

v6.0.0 introduces **Flow Error Explorer**, which translates Salesforce Flow runtime errors into plain English with causes and remediation steps.

When Flow Builder is opened from a fault debug link, the toolkit detects the error state in the debug panel and adds an **Explore Error** button to the debug toolbar. Opening it gives you:

* the Salesforce ExceptionCode extracted from the raw fault string
* the error category and a High, Medium, or Low severity rating
* the fault message with Salesforce boilerplate text stripped out
* any Salesforce record IDs mentioned in the fault
* the faulted element type, label, and API name where it can be resolved
* an indicator when the failure looks like a cascade caused by another flow or action
* common causes and actionable remediation recommendations
* a **Copy AI Prompt** action that assembles a ready-to-paste prompt for use in any AI tool

The release also adds a standalone **Error Dictionary**, available from the toolkit side button on any Salesforce Setup page. It catalogues known Flow error codes by category — validation, governor limits, data operations, access and permissions, Apex and actions, and duplicate rules — so you can look an error up proactively without an active debug session.

This release also recalibrates the Flow Health Check scoring model.

For full details, see [Flow Error Explorer]({{ '/features/flow-error-explorer.html' | relative_url }}).
